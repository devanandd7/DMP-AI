# Tumhara custom model naam → actual provider + model mapping
MODEL_MAP = {
    "dmp1": {
        "provider": "groq",
        "model": "llama-3.1-8b-instant",
        "description": "Lightning fast responses, great for real-time applications"
    },
    "dmp2": {
        "provider": "groq",
        "model": "mixtral-8x7b-32768",
        "description": "Pro quality with longer context window, ideal for complex tasks"
    },
    "dmp3": {
        "provider": "gemini",
        "model": "gemini-1.5-flash",
        "description": "Most capable model, best for advanced reasoning and analysis"
    }
}
