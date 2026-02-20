import openai

client = openai.OpenAI(
    api_key="sk-dmp-d836cea36f38e676292ae3197318a4af878a3774",
    base_url="http://localhost:8000/v1"
)

response = client.chat.completions.create(
    model="dmp1",   # dmp1 / dmp2 / dmp3
    messages=[{"role": "user", "content": "tell me about groq!"}]
)
print(response.choices[0].message.content)