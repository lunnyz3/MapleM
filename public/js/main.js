const form = document.getElementById("apiForm");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const ocidForm = document.getElementById("ocidForm");
const statusOcidEl = document.getElementById("statusOcid");
const resultOcidEl = document.getElementById("resultOcid");
const ocidInput = document.getElementById("ocid");
const detailEndpointSelect = document.getElementById("detailEndpoint");

async function parseResponseSafely(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    ok: false,
    message: "Expected JSON response but received non-JSON content.",
    contentType,
    bodyPreview: text.slice(0, 400)
  };
}

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.classList.remove("success", "error");

  if (type) {
    statusEl.classList.add(type);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const characterName = String(formData.get("character_name") || "").trim();
  const worldName = String(formData.get("world_name") || "").trim();

  if (!characterName || !worldName) {
    setStatus("Please enter both character_name and world_name.", "error");
    return;
  }

  setStatus("Requesting...", null);
  resultEl.textContent = "";

  const params = new URLSearchParams({
    character_name: characterName,
    world_name: worldName
  });

  try {
    const response = await fetch(`/api/maplestorym/id?${params.toString()}`);
    const payload = await parseResponseSafely(response);

    if (response.ok) {
      setStatus(`Success (${response.status})`, "success");
    } else {
      setStatus(`Failed (${response.status})`, "error");
    }

    resultEl.textContent = JSON.stringify(payload, null, 2);

    const extractedOcid = payload?.data?.ocid;
    if (response.ok && extractedOcid) {
      ocidInput.value = extractedOcid;
    }
  } catch (error) {
    setStatus("Network error", "error");
    resultEl.textContent = JSON.stringify({ message: error.message }, null, 2);
  }
});

function setOcidStatus(text, type) {
  statusOcidEl.textContent = text;
  statusOcidEl.classList.remove("success", "error");

  if (type) {
    statusOcidEl.classList.add(type);
  }
}

ocidForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const ocid = String(ocidInput.value || "").trim();
  const detailEndpoint = String(detailEndpointSelect.value || "").trim();

  if (!ocid || !detailEndpoint) {
    setOcidStatus("Please enter ocid and select endpoint.", "error");
    return;
  }

  setOcidStatus("Requesting...", null);
  resultOcidEl.textContent = "";

  const params = new URLSearchParams({ ocid });
  const url = `/api/maplestorym/character/${detailEndpoint}?${params.toString()}`;

  try {
    const response = await fetch(url);
    const payload = await parseResponseSafely(response);

    if (response.ok) {
      setOcidStatus(`Success (${response.status})`, "success");
    } else {
      setOcidStatus(`Failed (${response.status})`, "error");
    }

    resultOcidEl.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    setOcidStatus("Network error", "error");
    resultOcidEl.textContent = JSON.stringify({ message: error.message }, null, 2);
  }
});
