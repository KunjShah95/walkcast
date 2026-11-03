param(
  [switch]$WarmModel
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = $env:WALKCAST_KOKORO_PYTHON
if (-not $python) {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if (-not $command) { throw "Python was not found. Install Python 3.10+ or set WALKCAST_KOKORO_PYTHON to its executable." }
  $python = $command.Source
}
if (-not (Test-Path -LiteralPath $python)) { throw "WALKCAST_KOKORO_PYTHON does not exist: $python" }

$check = "import importlib.util as u; print('ok' if all(u.find_spec(m) for m in ('kokoro','numpy','soundfile')) else 'missing')"
$result = & $python -c $check
if ($LASTEXITCODE -ne 0 -or $result -notcontains "ok") {
  Write-Host "Installing Kokoro and its audio dependencies for $python..."
  & $python -m pip install --user kokoro numpy soundfile
  if ($LASTEXITCODE -ne 0) { throw "Kokoro installation failed. See pip output above." }
  $result = & $python -c $check
  if ($LASTEXITCODE -ne 0 -or $result -notcontains "ok") { throw "Python still cannot find Kokoro, NumPy, and SoundFile after installation." }
}

Write-Host "Kokoro is installed and available to Walkcast: $python"
Write-Host "Default launch voice: af_heart. Override with KOKORO_VOICE when needed."

if ($WarmModel) {
  $sampleDir = Join-Path $repo ".walkcast"
  New-Item -ItemType Directory -Force -Path $sampleDir | Out-Null
  $sample = Join-Path $sampleDir "kokoro-warmup.wav"
  $program = @'
import sys, numpy as np, soundfile as sf
from kokoro import KPipeline
pipe = KPipeline(lang_code="a")
parts = [audio for _, _, audio in pipe("Walkcast is ready to record your product walkthrough.", voice="af_heart")]
audio = np.concatenate(parts) if parts else np.zeros(0, dtype="float32")
sf.write(sys.argv[1], audio, 24000)
print(f"Kokoro model ready: {len(audio)/24000:.2f}s of speech")
'@
  Write-Host "Loading Kokoro and warming its local model cache..."
  & $python -c $program $sample
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sample)) { throw "Kokoro model warm-up failed. See Python output above." }
  Write-Host "Sample saved to $sample"
}
