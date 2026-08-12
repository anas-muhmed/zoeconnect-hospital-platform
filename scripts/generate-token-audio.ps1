# generate-token-audio.ps1
#
# Generates WAV audio chunks using Windows built-in TTS (no installs needed).
# Output: backend/static/token-audio/*.wav
#
# Run from any PowerShell prompt:
#   cd D:\HDSP
#   powershell -ExecutionPolicy Bypass -File scripts\generate-token-audio.ps1

Add-Type -AssemblyName System.Speech

$synth  = New-Object System.Speech.Synthesis.SpeechSynthesizer
$outDir = Join-Path $PSScriptRoot "..\backend\static\token-audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$synth.Rate   = -1   # slightly slower than default
$synth.Volume = 100

function Speak-ToFile($text, $filename) {
    $path = Join-Path $outDir $filename
    if (Test-Path $path) { Write-Host "  skip $filename"; return }
    $synth.SetOutputToWaveFile($path)
    $synth.Speak($text)
    $synth.SetOutputToDefaultAudioDevice()
    Write-Host "  OK   $filename"
}

$ones = @('','one','two','three','four','five','six','seven',
          'eight','nine','ten','eleven','twelve','thirteen',
          'fourteen','fifteen','sixteen','seventeen','eighteen','nineteen')
$tens = @('','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety')
$hundreds = @('','one hundred','two hundred','three hundred','four hundred',
              'five hundred','six hundred','seven hundred','eight hundred','nine hundred')

Write-Host "`nGenerating token audio (Windows SAPI)...`n"

Speak-ToFile "Token number" "token-prefix.wav"
Speak-ToFile "Counter"      "counter-prefix.wav"

for ($i = 1;  $i -le 19; $i++) { Speak-ToFile $ones[$i]          "n$i.wav"       }
for ($i = 2;  $i -le 9;  $i++) { Speak-ToFile $tens[$i]          "n$($i*10).wav" }
for ($i = 1;  $i -le 9;  $i++) { Speak-ToFile $hundreds[$i]      "h$($i*100).wav"}

$synth.Dispose()
$count = (Get-ChildItem $outDir -Filter "*.wav").Count
Write-Host "`nDone!  $count WAV files written to $outDir`n"
Write-Host "Restart the backend - it will serve them automatically."
