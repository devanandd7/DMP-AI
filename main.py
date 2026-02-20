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
from contextlib import asynccontextmanager
from groq import Groq
import requests as req_lib
import secrets, os
from datetime import datetime, date, timezone
from dotenv import load_dotenv
from models import MODEL_MAP
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

load_dotenv()

# ─── Config ──────────────────────────────────────────────────────────────────
GROQ_KEYS       = [v for k, v in sorted(os.environ.items()) if k.startswith("GROQ_KEY_")  and v.strip()]
GEMINI_KEYS     = [v for k, v in sorted(os.environ.items()) if k.startswith("GEMINI_KEY_") and v.strip()]
ADMIN_SECRET    = os.getenv("ADMIN_SECRET",    "change-this-secret")
FRONTEND_SECRET = os.getenv("FRONTEND_SECRET", "dmp-frontend-secret")  # shared with Next.js frontend
MONGODB_URI     = os.getenv("MONGODB_URI",     "mongodb://localhost:27017")

PLAN_LIMITS = {"free": 50, "basic": 300, "pro": 1000}

groq_index   = 0
gemini_index = 0

# ─── MongoDB Setup ─────────────────────────────────────────────────────────────
mongo_client: AsyncIOMotorClient = None   # type: ignore
users_col = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return str(date.today())


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo_client, users_col
    try:
        mongo_client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
        await mongo_client.admin.command("ping")
        db        = mongo_client["dmpai"]
        users_col = db["users"]

        # Indexes
        await users_col.create_index([("key",           ASCENDING)], unique=True)
        await users_col.create_index([("clerk_user_id", ASCENDING)], sparse=True, unique=True)

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

    # Rate limit
    plan       = user.get("plan", "free")
    limit      = PLAN_LIMITS.get(plan, 50)
    used_today = user.get("used_today", 0)
    if used_today >= limit:
        raise HTTPException(
            429,
            f"Daily limit reached ({used_today}/{limit}) for plan '{plan}'. Please upgrade."
        )

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
async def admin_list_users(x_admin_secret: str = Header(...)):
    """List all users with full profile and usage stats."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()

    docs = await users_col.find({}, {"_id": 0}).to_list(length=5000)
    return {
        "total": len(docs),
        "users": [
            {
                "key":            u.get("key", "")[:14] + "...",
                "plan":           u.get("plan"),
                "used_today":     u.get("used_today", 0),
                "total_calls":    u.get("total_calls", 0),
                "daily_limit":    PLAN_LIMITS.get(u.get("plan", "free"), 50),
                "last_reset":     u.get("last_reset"),
                "created_at":     u.get("created_at"),
                "last_active_at": u.get("last_active_at"),
                "is_active":      u.get("is_active", True),
                "has_clerk":      bool(u.get("clerk_user_id")),
                "profile":        u.get("profile", {}),
            }
            for u in docs
        ],
    }


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
    """Dashboard stats: users by plan, total calls, active users."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Invalid admin secret.")
    _db_check()

    pipeline = [
        {"$group": {
            "_id":          "$plan",
            "count":        {"$sum": 1},
            "calls_today":  {"$sum": "$used_today"},
            "total_calls":  {"$sum": "$total_calls"},
            "active_users": {"$sum": {"$cond": ["$is_active", 1, 0]}},
        }}
    ]
    results     = await users_col.aggregate(pipeline).to_list(100)
    total_users = sum(r["count"] for r in results)
    total_today = sum(r["calls_today"] for r in results)
    total_all   = sum(r["total_calls"] for r in results)

    return {
        "total_users":        total_users,
        "total_calls_today":  total_today,
        "total_calls_ever":   total_all,
        "by_plan": {
            r["_id"]: {
                "users":        r["count"],
                "calls_today":  r["calls_today"],
                "total_calls":  r["total_calls"],
                "active_users": r["active_users"],
            }
            for r in results
        },
    }
