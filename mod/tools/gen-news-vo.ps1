# gen-news-vo.ps1 - generador de voz (TTS) para los titulares del noticiario.
#
# Convierte texto a un WAV en el formato que usa el mod (PCM mono, 11025 Hz)
# usando el TTS offline de Windows (System.Speech, sin API ni red).
#
# Uso:
#   # Regenerar los 5 titulares de dia (por defecto):
#   powershell -ExecutionPolicy Bypass -File gen-news-vo.ps1
#
#   # Un unico fichero a partir de texto suelto:
#   powershell -ExecutionPolicy Bypass -File gen-news-vo.ps1 `
#       -Text "Field hospital destroyed." -Out "speech/news/day3.wav"
#
# Los WAV se escriben tanto en el arbol de source (mod\sound\...) como en el
# de instalacion (D:\quake\uplifter\sound\...) para mantenerlos sincronizados,
# igual que el resto de assets de sonido.

param(
    [string]$Text  = "",                 # texto suelto (modo single)
    [string]$Out   = "",                 # ruta relativa a sound/ (modo single)
    [int]   $Rate  = 11025,              # sample rate (Hz) - el mod usa 11025
    [int]   $Speed = -1,                 # velocidad de habla SAPI (-10..10)
    [string]$Voice = "Zira"              # voz preferida (en-US); cae a la default si no esta
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

# Raices de sonido (source + install). Si alguna no existe, se omite.
$soundRoots = @(
    "D:\code\uplifter\mod\sound",
    "D:\quake\uplifter\sound"
) | Where-Object { Test-Path $_ }

# Titulares por dia (texto natural para TTS; en pantalla van en mayusculas).
$dayLines = @{
    1 = "Breaking news. Goliath forces surround Davenport. The oil dispute has turned violent overnight."
    2 = "Breaking news. Goliath artillery strikes civilian blocks. Casualties mount overnight as the cordon tightens."
    3 = "Breaking news. Field hospital destroyed. Goliath jets struck a Davenport medical centre at dawn."
    4 = "Breaking news. The cordon hardens around the city. Goliath has reinforced the perimeter with heavy armour."
    5 = "Breaking news. A U.S. carrier arrives offshore. The international coalition prepares to receive a Davenport envoy."
}

function New-Synth {
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    # Elegir la voz preferida si esta instalada.
    $picked = $s.GetInstalledVoices() |
        Where-Object { $_.Enabled -and $_.VoiceInfo.Name -like "*$Voice*" } |
        Select-Object -First 1
    if ($picked) {
        $s.SelectVoice($picked.VoiceInfo.Name)
        Write-Host ("  voz: " + $picked.VoiceInfo.Name)
    } else {
        Write-Host ("  voz: (default) - '" + $Voice + "' no encontrada")
    }
    $s.Rate = $Speed
    return $s
}

function Write-Vo {
    param([System.Speech.Synthesis.SpeechSynthesizer]$Synth,
          [string]$Line, [string]$RelPath)

    $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        $Rate,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono)

    # Generar una vez en un temporal y copiar a cada raiz de sonido.
    $tmp = [System.IO.Path]::GetTempFileName() + ".wav"
    $Synth.SetOutputToWaveFile($tmp, $fmt)
    $Synth.Speak($Line)
    $Synth.SetOutputToNull()

    foreach ($root in $soundRoots) {
        $dest = Join-Path $root $RelPath
        $dir  = Split-Path $dest -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Copy-Item -Force $tmp $dest
        Write-Host ("  -> " + $dest)
    }
    Remove-Item -Force $tmp
}

$synth = New-Synth

if ($Text -ne "" -and $Out -ne "") {
    # Modo single.
    Write-Host ("Generando 1 fichero (" + $Rate + " Hz mono):")
    Write-Vo -Synth $synth -Line $Text -RelPath ($Out -replace '/', '\')
} else {
    # Modo batch: los 5 titulares de dia.
    Write-Host ("Generando titulares de dia (" + $Rate + " Hz mono):")
    foreach ($d in 1..5) {
        Write-Host ("[dia " + $d + "] " + $dayLines[$d])
        Write-Vo -Synth $synth -Line $dayLines[$d] -RelPath ("speech\news\day" + $d + ".wav")
    }
}

$synth.Dispose()
Write-Host "Listo."
