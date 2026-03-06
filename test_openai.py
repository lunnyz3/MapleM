import vertexai
from vertexai.generative_models import GenerativeModel

vertexai.init(
    project="gemini-test2-489317",
    location="us-central1"
)

model = GenerativeModel("gemini-2.5-flash")

print(model.generate_content("hello").text)