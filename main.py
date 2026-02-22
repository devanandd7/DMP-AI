"""
DMP AI API — main.py
====================
OpenAI-compatible FastAPI server
Storage  : MongoDB Atlas (Motor async driver)
Auth     : Custom API keys for chat  |  Frontend Secret for user routes
Providers: Groq (dmp1, dmp2) + Gemini (dmp3)

NOTE: Clerk auth is handled ENTIRELY on the frontend (Next.js).
      The backend does NOT verify Clerk JWTs.
      Frontend sends clerk_user_id + profile in request body,
      protected by a shared FRONTEND_SECRET header.

MongoDB User Document Schema:
{
  "key":            "sk-dmp-xxx",
  "plan":           "free",
  "used_today":     0,
  "total_calls":    0,
  "last_reset":     "2026-02-21",
  "created_at":     "2026-02-21T...",
  "last_active_at": "2026-02-21T...",
  "is_active":      True,
  "clerk_user_id":  "user_xxx",
  "profile":        {"name": "", "email": "", "avatar_url": ""}
}
"""

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from groq import Groq
import requests as req_lib
import secrets, os, io, time
import uvicorn
from collections import deque
from datetime import datetime, date, timezone
from dotenv import load_dotenv
from models import MODEL_MAP
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError
import edge_tts

load_dotenv()

# ─── Config ──────────────────────────────────────────────────────────────────
GROQ_KEYS       = [v for k, v in sorted(os.environ.items()) if k.startswith("GROQ_KEY_")  and v.strip()]
GEMINI_KEYS     = [v for k, v in sorted(os.environ.items()) if k.startswith("GEMINI_KEY_") and v.strip()]
ADMIN_SECRET    = os.getenv("ADMIN_SECRET",    "change-this-secret")
FRONTEND_SECRET = os.getenv("FRONTEND_SECRET", "dmp-frontend-secret")  # shared with Next.js frontend
MONGODB_URI     = os.getenv("MONGODB_URI",     "mongodb://localhost:27017")

# ── Per-plan daily call limits (doubled) ─────────────────────────────────────
PLAN_LIMITS          = {"free": 100, "basic": 600, "pro": 2000}
TTS_DAILY_CHAR_LIMIT = 54_333   # characters per TTS key per day

# ── Per-key rate limits (apply to ALL plans / ALL models) ─────────────────────
RPM_LIMIT           = 30       # 30 requests per 60-second window
TPM_LIMIT           = 35_000   # 35,000 tokens per 60-second window
DAILY_REQUEST_LIMIT = 350      # hard cap: 350 requests per calendar day

# In-memory sliding windows keyed by api_key
# Each entry is a deque of (timestamp_float, tokens_used_int)
_rpm_windows: dict[str, deque] = {}
_tpm_windows: dict[str, deque] = {}

groq_index   = 0
gemini_index = 0

# ─── MongoDB Setup ─────────────────────────────────────────────────────────────
mongo_client: AsyncIOMotorClient = None   # type: ignore
users_col = None
tts_col   = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return str(date.today())


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, users_col, tts_col
    try:
        mongo_client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
        await mongo_client.admin.command("ping")
        db        = mongo_client["dmpai"]
        users_col = db["users"]
        tts_col   = db["tts_keys"]

        # Indexes — users
        await users_col.create_index([("key",           ASCENDING)], unique=True)
        await users_col.create_index([("clerk_user_id", ASCENDING)], sparse=True, unique=True)
        # Indexes — tts_keys
        await tts_col.create_index([("tts_key", ASCENDING)], unique=True)

        print("✅  MongoDB Atlas connected!")
    except Exception as e:
        print(f"❌  MongoDB connection FAILED: {e}")
        print("    → Check MONGODB_URI in your .env file.")
    yield
    if mongo_client:
        mongo_client.close()
        print("🔌  MongoDB disconnected.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="DMP AI API",
    description="OpenAI-compatible AI API — powered by CrossEye",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Frontend Auth (replaces Clerk JWT verification on backend) ───────────────
def verify_frontend_secret(x_frontend_secret: str):
    """
    Simple shared-secret check between Next.js frontend and this backend.
    Clerk auth is handled 100% on the frontend — backend just trusts
    the clerk_user_id sent in the request body (protected by this secret).
    """
    if x_frontend_secret != FRONTEND_SECRET:
        raise HTTPException(403, "Invalid frontend secret. Check FRONTEND_SECRET in .env")


# ─── DB Helpers ───────────────────────────────────────────────────────────────
def _db_check():
    if users_col is None:
        raise HTTPException(503, "Database not connected. Check MONGODB_URI in .env")


async def get_user_by_key(api_key: str) -> dict | None:
    _db_check()
    return await users_col.find_one({"key": api_key}, {"_id": 0})


async def get_user_by_clerk_id(clerk_user_id: str) -> dict | None:
    _db_check()
    return await users_col.find_one({"clerk_user_id": clerk_user_id}, {"_id": 0})


async def reset_daily_usage_if_needed(api_key: str, user: dict) -> dict:
    today = today_str()
    if user.get("last_reset") != today:
        await users_col.update_one(
            {"key": api_key},
            {"$set": {"used_today": 0, "last_reset": today}},
        )
        user = dict(user, used_today=0, last_reset=today)
    return user


def _check_rate_limits(api_key: str, token_count: int = 0) -> None:
    """
    Enforce per-minute rate limits using in-memory sliding windows.
    Raises HTTP 429 if:
      - RPM  > 30  in the last 60 s
      - TPM  > 35,000 tokens in the last 60 s
    Does NOT check the daily 350-request cap (that is checked via PLAN_LIMITS).
    """
    now = time.time()
    window = 60.0  # 1-minute sliding window

    # ── requests per minute ───────────────────────────────────────────────────
    if api_key not in _rpm_windows:
        _rpm_windows[api_key] = deque()
    rpm_dq = _rpm_windows[api_key]
    # evict old entries
    while rpm_dq and now - rpm_dq[0][0] > window:
        rpm_dq.popleft()
    if len(rpm_dq) >= RPM_LIMIT:
        retry_after = int(window - (now - rpm_dq[0][0])) + 1
        raise HTTPException(
            429,
            f"Rate limit: {RPM_LIMIT} requests/min exceeded. "
            f"Retry after ~{retry_after}s."
        )
    rpm_dq.append((now, token_count))

    # ── tokens per minute ─────────────────────────────────────────────────────
    if api_key not in _tpm_windows:
        _tpm_windows[api_key] = deque()
    tpm_dq = _tpm_windows[api_key]
    while tpm_dq and now - tpm_dq[0][0] > window:
        tpm_dq.popleft()
    tokens_in_window = sum(t for _, t in tpm_dq)
    if tokens_in_window + token_count > TPM_LIMIT:
        retry_after = int(window - (now - tpm_dq[0][0])) + 1 if tpm_dq else 60
        raise HTTPException(
            429,
            f"Rate limit: {TPM_LIMIT:,} tokens/min would be exceeded "
            f"({tokens_in_window:,} used). Retry after ~{retry_after}s."
        )
    tpm_dq.append((now, token_count))


async def create_user_doc(
    key: str,
    plan: str,
    clerk_user_id: str | None = None,
    profile: dict | None = None,
) -> dict:
    """Insert a full user document into MongoDB."""
    _db_check()
    doc = {
        "key":           key,
        "plan":          plan,
        "used_today":    0,
        "total_calls":   0,
        "last_reset":    today_str(),
        "created_at":    now_iso(),
        "last_active_at": None,
        "is_active":     True,
        "clerk_user_id": clerk_user_id,
        "profile": profile or {
            "name":       "",
            "email":      "",
            "avatar_url": "",
        },
    }
    await users_col.insert_one(doc)
    doc.pop("_id", None)
    return doc


def _safe_user(user: dict) -> dict:
    """Remove MongoDB _id from user dict."""
    user.pop("_id", None)
    return user


# ─── Provider Calls ───────────────────────────────────────────────────────────
def call_groq(model: str, messages: list, max_tokens: int = 1024) -> str:
    global groq_index
    if not GROQ_KEYS:
        raise HTTPException(500, "No GROQ_KEY_* variables in .env")
    for attempt in range(len(GROQ_KEYS)):
        key = GROQ_KEYS[groq_index % len(GROQ_KEYS)]
        try:
            client   = Groq(api_key=key)
            response = client.chat.completions.create(
                model=model, messages=messages, max_tokens=max_tokens
            )
            return response.choices[0].message.content
        except Exception as e:
            groq_index += 1
            if attempt == len(GROQ_KEYS) - 1:
                raise HTTPException(502, f"Groq error: {e}")
    raise HTTPException(502, "All Groq keys failed")


def call_gemini(model: str, messages: list) -> str:
    global gemini_index
    if not GEMINI_KEYS:
        raise HTTPException(500, "No GEMINI_KEY_* variables in .env")
    for attempt in range(len(GEMINI_KEYS)):
        key = GEMINI_KEYS[gemini_index % len(GEMINI_KEYS)]
        try:
            contents = [
                {"role": "user" if m["role"] != "assistant" else "model",
                 "parts": [{"text": m["content"]}]}
                for m in messages
            ]
            url = (f"https://generativelanguage.googleapis.com/v1beta"
                   f"/models/{model}:generateContent?key={key}")
            res = req_lib.post(url, json={"contents": contents}, timeout=30)
            res.raise_for_status()
            return res.json()["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            gemini_index += 1
            if attempt == len(GEMINI_KEYS) - 1:
                raise HTTPException(502, f"Gemini error: {e}")
    raise HTTPException(502, "All Gemini keys failed")


# ─── Public Routes ────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "name":    "DMP AI API",
        "version": "1.0.0",
        "docs":    "/docs",
        "status":  "running",
        "models":  list(MODEL_MAP.keys()),
    }


@app.get("/v1/models", tags=["Models"])
async def list_models(authorization: str = Header(...)):
    api_key = authorization.replace("Bearer ", "").strip()
    if not await get_user_by_key(api_key):
        raise HTTPException(401, "Invalid API key.")
    return {
        "object": "list",
        "data": [
            {"id": name, "object": "model", "description": info["description"]}
            for name, info in MODEL_MAP.items()
        ],
    }


@app.post("/v1/chat/completions", tags=["Chat"])
async def chat(request: Request, authorization: str = Header(...)):
    """OpenAI-compatible chat endpoint. Drop-in replacement."""
    # Auth
    api_key = authorization.replace("Bearer ", "").strip()
    user    = await get_user_by_key(api_key)
    if not user:
        raise HTTPException(401, "Invalid API key.")
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is deactivated. Contact support.")

    # Daily reset
    user = await reset_daily_usage_if_needed(api_key, user)

    # ── Daily limit (plan-based) ──────────────────────────────────────────────
    plan       = user.get("plan", "free")
    limit      = PLAN_LIMITS.get(plan, 100)
    used_today = user.get("used_today", 0)
    if used_today >= limit:
        raise HTTPException(
            429,
            f"Daily limit reached ({used_today}/{limit}) for plan '{plan}'. "
            f"Upgrade or wait until tomorrow."
        )
    # Hard daily cap (applies to all plans)
    if used_today >= DAILY_REQUEST_LIMIT:
        raise HTTPException(
            429,
            f"Hard daily cap of {DAILY_REQUEST_LIMIT} requests reached. Resets tomorrow."
        )

    # ── Per-minute rate limits (RPM + TPM) — checked before provider call ────
    # We estimate 0 tokens here; the window records actual tokens after the call.
    _check_rate_limits(api_key, token_count=0)

    # Parse
    body            = await request.json()
    requested_model = body.get("model", "dmp1")
    messages        = body.get("messages", [])
    max_tokens      = int(body.get("max_tokens", 1024))

    if not messages:
        raise HTTPException(400, "'messages' field is required and must not be empty.")
    if requested_model not in MODEL_MAP:
        raise HTTPException(
            400,
            f"Unknown model '{requested_model}'. Available: {list(MODEL_MAP.keys())}"
        )

    # Call provider
    cfg    = MODEL_MAP[requested_model]
    result = (call_groq(cfg["model"], messages, max_tokens)
              if cfg["provider"] == "groq"
              else call_gemini(cfg["model"], messages))

    # Record actual token count into the TPM window (rough estimate via char count)
    approx_tokens = max(1, len(result) // 4 + sum(len(str(m)) for m in messages) // 4)
    _check_rate_limits(api_key, token_count=approx_tokens)

    # Update usage stats atomically
    await users_col.update_one(
        {"key": api_key},
        {
            "$inc": {"used_today": 1, "total_calls": 1},
            "$set": {"last_active_at": now_iso()},
        },
    )

    return {
        "id":      "chatcmpl-" + secrets.token_hex(8),
        "object":  "chat.completion",
        "model":   requested_model,
        "choices": [
            {"index": 0,
             "message": {"role": "assistant", "content": result},
             "finish_reason": "stop"}
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


# ─── User Routes (Clerk JWT required) ────────────────────────────────────────
@app.post("/user/generate-key", tags=["User"])
async def user_generate_key(request: Request, x_frontend_secret: str = Header(...)):
    """
    Generate (or retrieve) a DMP API key for a Clerk user.
    CLERK AUTH IS ON THE FRONTEND — backend trusts clerk_user_id from body,
    protected by shared FRONTEND_SECRET header.

    Body: { clerk_user_id, name, email, avatar_url }
    """
    verify_frontend_secret(x_frontend_secret)

    body          = await request.json()
    clerk_user_id = body.get("clerk_user_id", "").strip()
    if not clerk_user_id:
        raise HTTPException(400, "'clerk_user_id' is required in the request body.")

    profile_data = {
        "name":       body.get("name", ""),
        "email":      body.get("email", ""),
        "avatar_url": body.get("avatar_url", ""),
    }

    # Check if user already has a key — update profile and return existing
    existing = await get_user_by_clerk_id(clerk_user_id)
    if existing:
        update_fields: dict = {"updated_at": now_iso()}
        for field in ["name", "email", "avatar_url"]:
            if profile_data.get(field):
                update_fields[f"profile.{field}"] = profile_data[field]
        await users_col.update_one({"clerk_user_id": clerk_user_id}, {"$set": update_fields})
        plan = existing.get("plan", "free")
        return {
            "key":         existing["key"],
            "plan":        plan,
            "daily_limit": PLAN_LIMITS.get(plan, 50),
            "used_today":  existing.get("used_today", 0),
            "total_calls": existing.get("total_calls", 0),
            "created_at":  existing.get("created_at"),
            "profile":     existing.get("profile", {}),
            "message":     "Your existing API key — keep it safe!",
        }

    # New user — generate fresh key and store full profile in MongoDB
    new_key = "sk-dmp-" + secrets.token_hex(20)
    try:
        doc = await create_user_doc(
            key=new_key, plan="free",
            clerk_user_id=clerk_user_id,
            profile=profile_data,
        )
    except DuplicateKeyError:
        raise HTTPException(409, "Entry already exists. Please refresh and try again.")

    return {
        "key":         doc["key"],
        "plan":        doc["plan"],
        "daily_limit": PLAN_LIMITS["free"],
        "used_today":  0,
        "total_calls": 0,
        "created_at":  doc["created_at"],
        "profile":     doc["profile"],
        "message":     "API key successfully generated! 🎉",
    }



@app.get("/user/me", tags=["User"])
async def user_me(clerk_user_id: str, x_frontend_secret: str = Header(...)):
    """Return full profile + usage stats. Pass clerk_user_id as query param."""
    verify_frontend_secret(x_frontend_secret)
    user = await get_user_by_clerk_id(clerk_user_id)

    if not user:
        return {
            "has_key": False,
            "message": "No API key found. POST /user/generate-key to create one.",
        }

    plan = user.get("plan", "free")
    user = await reset_daily_usage_if_needed(user["key"], user)

    return {
        "has_key":        True,
        "key":            user["key"],
        "plan":           plan,
        "daily_limit":    PLAN_LIMITS.get(plan, 50),
        "used_today":     user.get("used_today", 0),
        "total_calls":    user.get("total_calls", 0),
        "last_reset":     user.get("last_reset"),
        "created_at":     user.get("created_at"),
        "last_active_at": user.get("last_active_at"),
        "is_active":      user.get("is_active", True),
        "profile":        user.get("profile", {}),
    }


@app.patch("/user/update-profile", tags=["User"])
async def user_update_profile(request: Request, x_frontend_secret: str = Header(...)):
    """Update user profile. Body: { clerk_user_id, name?, email?, avatar_url? }"""
    verify_frontend_secret(x_frontend_secret)
    body          = await request.json()
    clerk_user_id = body.get("clerk_user_id", "").strip()
    if not clerk_user_id:
        raise HTTPException(400, "'clerk_user_id' required.")

    user = await get_user_by_clerk_id(clerk_user_id)
    if not user:
        raise HTTPException(404, "User not found. Generate a key first.")

    set_fields = {"updated_at": now_iso()}
    for field in ["name", "email", "avatar_url"]:
        if field in body:
            set_fields[f"profile.{field}"] = body[field]

    await users_col.update_one({"clerk_user_id": clerk_user_id}, {"$set": set_fields})
    return {"message": "Profile updated.", "updated_fields": [f for f in ["name", "email", "avatar_url"] if f in body]}


# ─── Admin Routes ─────────────────────────────────────────────────────────────
@app.post("/admin/generate-key", tags=["Admin"])
async def admin_generate_key(plan: str = "free", x_admin_secret: str = Header(...)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    if plan not in PLAN_LIMITS:
        raise HTTPException(400, f"Invalid plan. Choose: {list(PLAN_LIMITS.keys())}")
    new_key = "sk-dmp-" + secrets.token_hex(20)
    doc     = await create_user_doc(new_key, plan)
    return {"key": doc["key"], "plan": doc["plan"], "daily_limit": PLAN_LIMITS[plan], "created_at": doc["created_at"]}


@app.get("/admin/users", tags=["Admin"])
async def admin_list_users(
    x_admin_secret: str = Header(...),
    skip: int = 0,
    limit: int = 50,
    plan: str | None = None,
    active: bool | None = None,
):
    """List all chat API users with full stats + their linked TTS keys."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()

    query: dict = {}
    if plan:
        query["plan"] = plan
    if active is not None:
        query["is_active"] = active

    cursor     = users_col.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    users_list = []
    async for u in cursor:
        raw_key = u.get("key", "")
        # Count linked TTS keys
        tts_count = await tts_col.count_documents({"linked_dmp_key": raw_key}) if raw_key else 0
        users_list.append({
            "key":            raw_key[:14] + "..." if raw_key else "—",
            "plan":           u.get("plan", "free"),
            "used_today":     u.get("used_today", 0),
            "total_calls":    u.get("total_calls", 0),
            "daily_limit":    PLAN_LIMITS.get(u.get("plan", "free"), 100),
            "last_reset":     u.get("last_reset"),
            "created_at":     u.get("created_at"),
            "last_active_at": u.get("last_active_at"),
            "is_active":      u.get("is_active", True),
            "clerk_user_id":  u.get("clerk_user_id"),
            "profile":        u.get("profile", {}),
            "tts_keys_count": tts_count,
            "services":       ["chat"] + (["tts"] if tts_count > 0 else []),
        })

    total = await users_col.count_documents(query)
    return {"total": total, "skip": skip, "limit": limit, "users": users_list}


@app.patch("/admin/upgrade-plan", tags=["Admin"])
async def admin_upgrade_plan(api_key: str, new_plan: str, x_admin_secret: str = Header(...)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    if new_plan not in PLAN_LIMITS:
        raise HTTPException(400, f"Invalid plan. Choose: {list(PLAN_LIMITS.keys())}")
    _db_check()
    result = await users_col.update_one(
        {"key": api_key},
        {"$set": {"plan": new_plan, "updated_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "API key not found.")
    return {"message": f"Plan updated to '{new_plan}'.", "new_limit": PLAN_LIMITS[new_plan]}


@app.patch("/admin/toggle-user", tags=["Admin"])
async def admin_toggle_user(api_key: str, active: bool, x_admin_secret: str = Header(...)):
    """Activate or deactivate a user account."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()
    result = await users_col.update_one(
        {"key": api_key},
        {"$set": {"is_active": active, "updated_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "API key not found.")
    return {"message": f"User {'activated' if active else 'deactivated'} successfully."}


@app.delete("/admin/revoke-key", tags=["Admin"])
async def admin_revoke_key(api_key: str, x_admin_secret: str = Header(...)):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()
    result = await users_col.delete_one({"key": api_key})
    if result.deleted_count == 0:
        raise HTTPException(404, "Key not found.")
    return {"message": "Key deleted permanently.", "key": api_key[:14] + "..."}


@app.get("/admin/stats", tags=["Admin"])
async def admin_stats(x_admin_secret: str = Header(...)):
    """Rich dashboard stats: chat users + TTS keys combined."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()
    from datetime import timedelta

    # ── Chat users aggregate ─────────────────────────────────────
    plan_pipeline = [
        {"$group": {
            "_id":          "$plan",
            "users":        {"$sum": 1},
            "calls_today":  {"$sum": "$used_today"},
            "total_calls":  {"$sum": "$total_calls"},
            "active_users": {"$sum": {"$cond": ["$is_active", 1, 0]}},
        }}
    ]
    plan_results = await users_col.aggregate(plan_pipeline).to_list(100)
    total_users  = sum(r["users"] for r in plan_results)
    total_today  = sum(r["calls_today"] for r in plan_results)
    total_ever   = sum(r["total_calls"] for r in plan_results)
    active_users = sum(r["active_users"] for r in plan_results)

    week_ago    = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    active_week = await users_col.count_documents({"last_active_at": {"$gte": week_ago}})

    # ── TTS aggregate ─────────────────────────────────────────────
    total_tts_keys  = await tts_col.count_documents({})
    active_tts_keys = await tts_col.count_documents({"is_active": True})
    tts_agg_pipe    = [{"$group": {"_id": None,
                                   "total_chars": {"$sum": "$total_chars"},
                                   "chars_today": {"$sum": "$chars_today"}}}]
    tts_agg_res = await tts_col.aggregate(tts_agg_pipe).to_list(1)
    tts_agg     = tts_agg_res[0] if tts_agg_res else {"total_chars": 0, "chars_today": 0}

    return {
        "chat": {
            "total_users":      total_users,
            "active_users":     active_users,
            "users_with_key":   total_users,
            "active_this_week": active_week,
            "plan_breakdown":   {
                r["_id"]: {
                    "users":        r["users"],
                    "calls_today":  r["calls_today"],
                    "total_calls":  r["total_calls"],
                    "active_users": r["active_users"],
                }
                for r in plan_results
            },
            "total_api_calls":  total_ever,
            "calls_today":      total_today,
        },
        "tts": {
            "total_tts_keys":          total_tts_keys,
            "active_tts_keys":         active_tts_keys,
            "total_chars_synthesized": tts_agg.get("total_chars", 0),
            "chars_today":             tts_agg.get("chars_today", 0),
            "daily_limit_per_key":     TTS_DAILY_CHAR_LIMIT,
        },
        "generated_at": now_iso(),
    }


@app.get("/admin/tts-users", tags=["Admin"])
async def admin_list_tts_users(
    x_admin_secret: str = Header(...),
    skip: int = 0,
    limit: int = 50,
    active: bool | None = None,
):
    """List all TTS key holders with usage stats. Supports pagination + filtering."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()

    query: dict = {}
    if active is not None:
        query["is_active"] = active

    cursor   = tts_col.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    tts_list = []
    async for doc in cursor:
        if doc.get("tts_key"):
            doc["tts_key"] = doc["tts_key"][:18] + "..."
        tts_list.append(doc)

    total = await tts_col.count_documents(query)
    return {"total": total, "skip": skip, "limit": limit, "tts_keys": tts_list}


#
# Available voices (pass as "voice" field in /v1/tts/synthesize):
#
# ENGLISH (en-US)
#   en-US-AvaMultilingualNeural        Female, multilingual (best for Hinglish)
#   en-US-AndrewMultilingualNeural     Male,   multilingual
#   en-US-EmmaMultilingualNeural       Female, multilingual
#   en-US-BrianMultilingualNeural      Male,   multilingual
#   en-US-AvaNeural                    Female, natural
#   en-US-AndrewNeural                 Male,   natural
#   en-US-AriaNeural                   Female, expressive
#   en-US-ChristopherNeural            Male,   expressive
#   en-US-GuyNeural                    Male,   natural
#   en-US-JennyNeural                  Female, news/chat
#   en-US-MichelleNeural               Female, friendly
#   en-US-RogerNeural                  Male,   natural
#   en-US-SteffanNeural                Male,   natural
#
# ENGLISH (en-IN — India accent)
#   en-IN-NeerjaExpressiveNeural       Female, expressive
#   en-IN-NeerjaNeural                 Female
#   en-IN-PrabhatNeural                Male
#
# ENGLISH (en-GB)
#   en-GB-SoniaNeural                  Female
#   en-GB-RyanNeural                   Male
#   en-GB-LibbyNeural                  Female
#   en-GB-MaisieNeural                 Female, child
#
# HINDI (hi-IN)
#   hi-IN-SwaraNeural                  Female  ← best Hindi female
#   hi-IN-MadhurNeural                 Male    ← best Hindi male
#
# DEFAULT VOICE: en-US-AvaMultilingualNeural  (handles English + Hindi + Hinglish)
# ─────────────────────────────────────────────────────────────────────────────

TTS_VOICES = [
    # ── English US ────────────────────────────────────────────────────────────
    {"id": "en-US-AvaMultilingualNeural",    "language": "en-US", "gender": "Female", "style": "Multilingual (best for Hinglish)"},
    {"id": "en-US-AndrewMultilingualNeural", "language": "en-US", "gender": "Male",   "style": "Multilingual"},
    {"id": "en-US-EmmaMultilingualNeural",   "language": "en-US", "gender": "Female", "style": "Multilingual"},
    {"id": "en-US-BrianMultilingualNeural",  "language": "en-US", "gender": "Male",   "style": "Multilingual"},
    {"id": "en-US-AvaNeural",                "language": "en-US", "gender": "Female", "style": "Natural"},
    {"id": "en-US-AndrewNeural",             "language": "en-US", "gender": "Male",   "style": "Natural"},
    {"id": "en-US-AriaNeural",               "language": "en-US", "gender": "Female", "style": "Expressive"},
    {"id": "en-US-ChristopherNeural",        "language": "en-US", "gender": "Male",   "style": "Expressive"},
    {"id": "en-US-GuyNeural",                "language": "en-US", "gender": "Male",   "style": "Natural"},
    {"id": "en-US-JennyNeural",              "language": "en-US", "gender": "Female", "style": "News/Chat"},
    {"id": "en-US-MichelleNeural",           "language": "en-US", "gender": "Female", "style": "Friendly"},
    {"id": "en-US-RogerNeural",              "language": "en-US", "gender": "Male",   "style": "Natural"},
    {"id": "en-US-SteffanNeural",            "language": "en-US", "gender": "Male",   "style": "Natural"},
    # ── English India ─────────────────────────────────────────────────────────
    {"id": "en-IN-NeerjaExpressiveNeural",   "language": "en-IN", "gender": "Female", "style": "Expressive"},
    {"id": "en-IN-NeerjaNeural",             "language": "en-IN", "gender": "Female", "style": "Natural"},
    {"id": "en-IN-PrabhatNeural",            "language": "en-IN", "gender": "Male",   "style": "Natural"},
    # ── English UK ────────────────────────────────────────────────────────────
    {"id": "en-GB-SoniaNeural",              "language": "en-GB", "gender": "Female", "style": "Natural"},
    {"id": "en-GB-RyanNeural",               "language": "en-GB", "gender": "Male",   "style": "Natural"},
    {"id": "en-GB-LibbyNeural",              "language": "en-GB", "gender": "Female", "style": "Natural"},
    {"id": "en-GB-MaisieNeural",             "language": "en-GB", "gender": "Female", "style": "Child"},
    # ── Hindi India ───────────────────────────────────────────────────────────
    {"id": "hi-IN-SwaraNeural",              "language": "hi-IN", "gender": "Female", "style": "Natural"},
    {"id": "hi-IN-MadhurNeural",             "language": "hi-IN", "gender": "Male",   "style": "Natural"},
]

TTS_VOICE_IDS = {v["id"] for v in TTS_VOICES}


# ── helpers ───────────────────────────────────────────────────────────────────
def _tts_db_check():
    if tts_col is None:
        raise HTTPException(503, "Database not connected. Check MONGODB_URI in .env")


async def _get_tts_key(tts_key: str) -> dict | None:
    _tts_db_check()
    return await tts_col.find_one({"tts_key": tts_key}, {"_id": 0})


async def _reset_tts_daily_if_needed(tts_key: str, doc: dict) -> dict:
    today = today_str()
    if doc.get("last_reset") != today:
        await tts_col.update_one(
            {"tts_key": tts_key},
            {"$set": {"chars_today": 0, "last_reset": today}},
        )
        doc = dict(doc, chars_today=0, last_reset=today)
    return doc


async def _tts_auth(authorization: str) -> dict:
    """Validate Bearer sk-tts-* key, reset daily counter, return doc."""
    tts_key = authorization.replace("Bearer ", "").strip()
    if not tts_key.startswith("sk-tts-"):
        raise HTTPException(401, "Invalid TTS API key. Keys must start with 'sk-tts-'.")
    doc = await _get_tts_key(tts_key)
    if not doc:
        raise HTTPException(401, "TTS API key not found.")
    if not doc.get("is_active", True):
        raise HTTPException(403, "TTS key is deactivated. Contact support.")
    doc = await _reset_tts_daily_if_needed(tts_key, doc)
    return doc


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get("/v1/tts/voices", tags=["TTS"])
async def tts_voices():
    """
    List all supported TTS voices.
    No authentication required.
    """
    return {
        "total":  len(TTS_VOICES),
        "voices": TTS_VOICES,
        "tip":    "For Hinglish (Hindi+English mixed), use en-US-AvaMultilingualNeural.",
    }


@app.post("/v1/tts/generate-key", tags=["TTS"])
async def tts_generate_key(request: Request):
    """
    Generate a TTS API key (`sk-tts-*`).

    Optional body fields:
    - `label`         : friendly name for this key (default: "My TTS Key")
    - `linked_dmp_key`: your existing `sk-dmp-*` chat key — links accounts

    No mandatory auth — anyone can create a TTS key.
    If you pass a valid `linked_dmp_key`, the TTS key will be associated
    with your chat account for easier management.
    """
    _tts_db_check()
    try:
        body = await request.json()
    except Exception:
        body = {}
    label          = (body.get("label") or "My TTS Key").strip()[:80]
    linked_dmp_key = (body.get("linked_dmp_key") or "").strip() or None

    # Validate linked DMP key if provided
    if linked_dmp_key:
        dmp_user = await get_user_by_key(linked_dmp_key)
        if not dmp_user:
            raise HTTPException(400, "linked_dmp_key not found. Pass a valid sk-dmp-* key or omit it.")

    new_tts_key = "sk-tts-" + secrets.token_hex(20)
    doc = {
        "tts_key":        new_tts_key,
        "label":          label,
        "chars_today":    0,
        "last_reset":     today_str(),
        "total_chars":    0,
        "daily_limit":    TTS_DAILY_CHAR_LIMIT,
        "created_at":     now_iso(),
        "last_active_at": None,
        "is_active":      True,
        "linked_dmp_key": linked_dmp_key,
    }
    await tts_col.insert_one(doc)
    doc.pop("_id", None)

    return {
        "tts_key":        new_tts_key,
        "label":          label,
        "daily_limit":    TTS_DAILY_CHAR_LIMIT,
        "chars_today":    0,
        "remaining":      TTS_DAILY_CHAR_LIMIT,
        "created_at":     doc["created_at"],
        "linked_dmp_key": linked_dmp_key,
        "message":        "TTS API key generated! 🎉 Keep it safe — it's shown only once.",
        "usage_example": {
            "endpoint": "POST /v1/tts/synthesize",
            "headers":  {"Authorization": f"Bearer {new_tts_key}"},
            "body":     {"text": "Hello दोस्तों!", "voice": "en-US-AvaMultilingualNeural"},
        },
    }


@app.get("/v1/tts/key-info", tags=["TTS"])
async def tts_key_info(authorization: str = Header(...)):
    """
    Return current usage stats for a TTS API key.

    Headers: `Authorization: Bearer sk-tts-<your-key>`
    """
    doc         = await _tts_auth(authorization)
    chars_today = doc.get("chars_today", 0)
    remaining   = max(0, TTS_DAILY_CHAR_LIMIT - chars_today)
    return {
        "tts_key":        doc["tts_key"][:14] + "...",
        "label":          doc.get("label"),
        "daily_limit":    TTS_DAILY_CHAR_LIMIT,
        "chars_today":    chars_today,
        "remaining":      remaining,
        "total_chars":    doc.get("total_chars", 0),
        "last_reset":     doc.get("last_reset"),
        "created_at":     doc.get("created_at"),
        "last_active_at": doc.get("last_active_at"),
        "is_active":      doc.get("is_active", True),
        "linked_dmp_key": bool(doc.get("linked_dmp_key")),
    }


@app.post("/v1/tts/synthesize", tags=["TTS"])
async def tts_synthesize(request: Request, authorization: str = Header(...)):
    """
    Synthesize text to speech using Edge TTS.
    Returns an **MP3 audio** stream directly in the response body.

    Headers: `Authorization: Bearer sk-tts-<your-key>`

    Body:
    ```json
    {
      "text":   "Hello दोस्तों!",
      "voice":  "en-US-AvaMultilingualNeural",
      "rate":   "+0%",
      "volume": "+0%"
    }
    ```

    - `voice`  : see GET /v1/tts/voices for all options (default: en-US-AvaMultilingualNeural)
    - `rate`   : speed adjustment e.g. "+10%", "-20%" (default: +0%)
    - `volume` : volume adjustment e.g. "+10%", "-5%"  (default: +0%)

    Daily limit: **54,333 characters/day** per key.
    """
    doc     = await _tts_auth(authorization)
    tts_key = doc["tts_key"]

    body   = await request.json()
    text   = (body.get("text")   or "").strip()
    voice  = (body.get("voice")  or "en-US-AvaMultilingualNeural").strip()
    rate   = (body.get("rate")   or "+0%").strip()
    volume = (body.get("volume") or "+0%").strip()

    if not text:
        raise HTTPException(400, "'text' field is required and must not be empty.")
    if voice not in TTS_VOICE_IDS:
        raise HTTPException(
            400,
            f"Unknown voice '{voice}'. Call GET /v1/tts/voices for the full list."
        )

    char_count  = len(text)
    chars_today = doc.get("chars_today", 0)
    remaining   = TTS_DAILY_CHAR_LIMIT - chars_today

    if char_count > remaining:
        raise HTTPException(
            429,
            f"Daily character limit reached. "
            f"Used: {chars_today}/{TTS_DAILY_CHAR_LIMIT}. "
            f"Remaining: {remaining} chars. "
            f"This request needs {char_count} chars. Resets tomorrow."
        )

    # Synthesize with edge-tts into an in-memory buffer
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
        audio_buf   = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buf.write(chunk["data"])
        audio_buf.seek(0)
        audio_bytes = audio_buf.read()
    except Exception as exc:
        raise HTTPException(502, f"Edge TTS error: {exc}")

    if not audio_bytes:
        raise HTTPException(502, "Edge TTS returned empty audio. Try a different voice or text.")

    # Update usage stats atomically
    await tts_col.update_one(
        {"tts_key": tts_key},
        {
            "$inc": {"chars_today": char_count, "total_chars": char_count},
            "$set": {"last_active_at": now_iso()},
        },
    )

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={
            "X-Chars-Used":        str(chars_today + char_count),
            "X-Chars-Remaining":   str(remaining - char_count),
            "X-Daily-Limit":       str(TTS_DAILY_CHAR_LIMIT),
            "X-Voice":             voice,
            "Content-Disposition": 'inline; filename="tts_output.mp3"',
        },
    )






# ─── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  🚀  DMP AI API Server")
    print("=" * 55)
    print("  📡  URL      : http://localhost:8000")
    print("  📖  Docs     : http://localhost:8000/docs")
    print("  🔄  Mode     : Auto-reload ON")
    print("  🛑  Stop     : Press Ctrl+C")
    print("=" * 55 + "\n")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
