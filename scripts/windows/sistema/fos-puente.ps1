# FOS Scout Lab: el puente local en Windows, sin repositorio ni Node.
#
# El puente (bg-server.py, puerto 7001) trae StatsBomb, SkillCorner,
# Transfermarkt, los textos con IA y el recorte de fotos, y sirve la app
# entera en http://127.0.0.1:7001/ para que página y datos compartan origen.
#
#   fos-puente.ps1 instalar      Python 3.11, entorno, librerías, arranque al iniciar sesión
#   fos-puente.ps1 arrancar      lo pone en marcha, oculto
#   fos-puente.ps1 parar
#   fos-puente.ps1 reiniciar
#   fos-puente.ps1 ventana       en primer plano, con el registro a la vista
#   fos-puente.ps1 comprobar     si responde y qué credenciales ve
#   fos-puente.ps1 credenciales  abre el archivo de credenciales
#   fos-puente.ps1 actualizar    baja la última versión del puente de GitHub (main)
#   fos-puente.ps1 desinstalar   quita el arranque automático y lo para
#
# Los .cmd de la carpeta de arriba solo llaman a este script con una acción.
# Escrito para el PowerShell 5.1 que trae Windows: nada de ?? ni &&, y el
# archivo va en UTF-8 con BOM para que lea bien las tildes.

param([string]$Accion = "instalar")

$ErrorActionPreference = "Stop"
$Puerto = 7001
$Casa = $env:USERPROFILE
$Venv = Join-Path $Casa ".rembg-venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Datos = Join-Path $Casa ".fos-scouting"
$CarpetaPuente = Join-Path $Datos "puente"
$Credenciales = Join-Path $Datos "credentials.json"
$Registro = Join-Path $Datos "puente.log"
$Inicio = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$Lanzador = Join-Path $Inicio "fos-puente.vbs"
$UrlPuente = "https://raw.githubusercontent.com/felipeorma/fos-scout-lab/main/scripts/bg-server.py"
$Dependencias = @("rembg[cpu,cli]", "fastapi", "uvicorn", "python-multipart", "requests")

function Paso([string]$Texto) {
  Write-Host ""
  Write-Host "==> $Texto" -ForegroundColor Cyan
}

function Bien([string]$Texto) { Write-Host "    $Texto" -ForegroundColor Green }
function Aviso([string]$Texto) { Write-Host "    $Texto" -ForegroundColor Yellow }

# Un programa de fuera (py, pip, winget): sus avisos por stderr no son errores
# —con "Stop", PowerShell 5.1 los trataría como tales—; cuenta su código de salida.
function Ejecutar([string]$Exe, [string[]]$Argumentos) {
  $ErrorActionPreference = "Continue"
  & $Exe @Argumentos | Out-Host
  return $LASTEXITCODE
}

# El Python con el que crear el entorno: el lanzador py, o el que deja winget.
# Ojo: PowerShell no distingue mayúsculas, así que se llama $base y nunca
# $python, que pisaría a $Python (el del entorno).
# Va en un objeto y no en un array: PowerShell desarma los arrays de un
# elemento al devolverlos.
function Buscar-Python {
  foreach ($version in @("-3.11", "-3.12")) {
    try {
      & py $version --version *> $null
      if ($LASTEXITCODE -eq 0) { return [pscustomobject]@{ Exe = "py"; Args = @($version) } }
    } catch { }
  }
  $directo = Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
  if (Test-Path $directo) { return [pscustomobject]@{ Exe = $directo; Args = @() } }
  return $null
}

function Instalar-Python {
  $base = Buscar-Python
  if ($base) {
    Bien "Python encontrado: $($base.Exe) $($base.Args -join ' ')"
    return $base
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "No hay Python 3.11 ni winget para instalarlo. Instala Python 3.11 desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH') y vuelve a abrir '1 - Instalar'."
  }
  Aviso "No hay Python 3.11. Lo instalo con winget (puede pedir permiso)."
  Ejecutar "winget" @("install", "-e", "--id", "Python.Python.3.11", "--scope", "user", "--accept-package-agreements", "--accept-source-agreements") | Out-Null
  # winget deja el PATH nuevo para las ventanas que se abran después: se recarga aquí.
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
  $base = Buscar-Python
  if (-not $base) { throw "Python se instaló pero no lo encuentro. Cierra esta ventana y vuelve a abrir '1 - Instalar'." }
  return $base
}

# El puente que viene en la carpeta (junto a este script, o en scripts\ si
# esto se abre desde el repositorio); con -DeGitHub, el último de main.
function Copiar-Puente([switch]$DeGitHub) {
  New-Item -ItemType Directory -Force -Path $CarpetaPuente | Out-Null
  $destino = Join-Path $CarpetaPuente "bg-server.py"
  $local = @((Join-Path $PSScriptRoot "bg-server.py"), (Join-Path $PSScriptRoot "..\..\bg-server.py")) |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($local -and -not $DeGitHub) {
    Copy-Item -Force $local $destino
    Bien "Puente copiado de $local"
    return
  }
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $UrlPuente -OutFile $destino
    Bien "Puente descargado de GitHub."
  } catch {
    if ($local) {
      Copy-Item -Force $local $destino
      Aviso "Sin conexión con GitHub: uso la copia de esta carpeta."
    } else {
      throw "No pude descargar el puente de GitHub: $($_.Exception.Message)"
    }
  }
}

function Preparar-Credenciales {
  New-Item -ItemType Directory -Force -Path $Datos | Out-Null
  if (Test-Path $Credenciales) {
    Bien "Credenciales: ya existe $Credenciales"
    return $false
  }
  $plantilla = @"
{
  "statsbomb": { "username": "", "password": "" },
  "skillcorner": { "username": "", "password": "" },
  "anthropic": "",
  "api-football": ""
}
"@
  # Sin BOM: el puente lo lee en utf-8 y un BOM rompería el JSON.
  [System.IO.File]::WriteAllText($Credenciales, $plantilla, (New-Object System.Text.UTF8Encoding($false)))
  Bien "Plantilla de credenciales creada en $Credenciales"
  return $true
}

# Lo que va detrás de "cmd /c": el puente con python.exe y la salida a
# puente.log. Con pythonw.exe uvicorn no arranca (sin consola, su registro
# falla), así que es python.exe en una consola que se esconde.
function Orden-Del-Puente {
  return "`"`"$Python`" -X utf8 -m uvicorn bg-server:app --app-dir `"$CarpetaPuente`" --port $Puerto --log-level warning > `"$Registro`" 2>&1`""
}

# Un .vbs en la carpeta Inicio arranca el puente oculto al entrar en Windows,
# como el servicio del Mac. Si la ruta lleva tildes (C:\Users\Felipe
# Ormazábal) va en UTF-16, que Windows Script Host también lee.
function Escribir-Lanzador {
  New-Item -ItemType Directory -Force -Path $Inicio | Out-Null
  $linea = "cmd /c " + (Orden-Del-Puente)
  $vbs = 'CreateObject("WScript.Shell").Run "' + $linea.Replace('"', '""') + '", 0, False' + "`r`n"
  $codificacion = [System.Text.Encoding]::ASCII
  if ($vbs -match '[^\x00-\x7F]') { $codificacion = [System.Text.Encoding]::Unicode }
  [System.IO.File]::WriteAllText($Lanzador, $vbs, $codificacion)
  Bien "Arranque automático al iniciar sesión: $Lanzador"
}

# Lo último del registro del puente, para ver por qué no responde.
function Mostrar-Registro {
  if (Test-Path $Registro) {
    Write-Host ""
    Write-Host "    Últimas líneas de $($Registro):"
    Get-Content -Tail 15 $Registro | ForEach-Object { Write-Host "      $_" }
  }
}

function Proceso-Del-Puente {
  try {
    $conexion = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction Stop | Select-Object -First 1
    return $conexion.OwningProcess
  } catch {
    return $null
  }
}

function Esta-En-Marcha {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Puerto/api/sources/status" -TimeoutSec 3
    return $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Arrancar {
  if (Esta-En-Marcha) {
    Bien "El puente ya está en marcha en http://127.0.0.1:$Puerto"
    return
  }
  if (-not (Test-Path $Python)) { throw "El puente no está instalado. Abre primero '1 - Instalar'." }
  # Directo y no por el .vbs: así arranca aunque Windows tenga VBScript apagado.
  Start-Process -WindowStyle Hidden -FilePath $env:ComSpec -ArgumentList ("/c " + (Orden-Del-Puente))
  # La primera vez, cargar rembg y onnxruntime en Windows puede pasar del medio minuto.
  Write-Host -NoNewline "    Esperando a que responda"
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    if (Esta-En-Marcha) {
      Write-Host ""
      Bien "Puente en marcha en http://127.0.0.1:$Puerto"
      return
    }
    if ($i % 5 -eq 4) { Write-Host -NoNewline "." }
  }
  Write-Host ""
  Aviso "Lo he arrancado pero no responde. 'Comprobar puente' te dice por qué."
  Mostrar-Registro
}

function Arrancar-Con-Ventana {
  if (Esta-En-Marcha) {
    Aviso "Ya hay un puente en marcha en el puerto ${Puerto}: lo paro para verlo aquí."
    Parar
  }
  if (-not (Test-Path $Python)) { throw "El puente no está instalado. Abre primero '1 - Instalar'." }
  Write-Host "Puente en http://127.0.0.1:$Puerto (cierra esta ventana para pararlo)..."
  # uvicorn escribe su registro por stderr: aquí es lo que se quiere ver, no un error.
  $ErrorActionPreference = "Continue"
  & $Python -X utf8 -m uvicorn bg-server:app --app-dir $CarpetaPuente --port $Puerto
}

function Parar {
  $proceso = Proceso-Del-Puente
  if ($proceso) {
    Stop-Process -Id $proceso -Force
    Start-Sleep -Milliseconds 500
    Bien "Puente parado."
  } else {
    Bien "No había ningún puente en marcha."
  }
}

# De abajo arriba, todo lo que hace falta para que la app lea StatsBomb, con un
# veredicto al final. No muestra contraseñas ni claves.
function Comprobar {
  $problemas = New-Object System.Collections.ArrayList

  Paso "Instalación"
  $piezas = [ordered]@{ "Python del entorno" = $Python; "Puente" = (Join-Path $CarpetaPuente "bg-server.py"); "Arranque al iniciar sesión" = $Lanzador }
  foreach ($pieza in $piezas.GetEnumerator()) {
    if (Test-Path $pieza.Value) { Bien "$($pieza.Key): sí" }
    else { Aviso "$($pieza.Key): NO ($($pieza.Value))"; [void]$problemas.Add("Falta '$($pieza.Key)': vuelve a abrir '1 - Instalar'.") }
  }

  Paso "Credenciales ($Credenciales)"
  $creds = $null
  if (-not (Test-Path $Credenciales)) {
    Aviso "No existe."
    [void]$problemas.Add("Crea las credenciales con '2 - Credenciales'.")
  } else {
    # Se valida con el Python del puente: PowerShell perdona cosas, como una
    # coma de más al final, que a Python le hacen tirar el archivo entero.
    $fallo = ""
    if (Test-Path $Python) {
      $fallo = (& { $ErrorActionPreference = "Continue"; & $Python -X utf8 -c "import json, sys`ntry: json.loads(open(sys.argv[1], encoding='utf-8-sig').read())`nexcept ValueError as e: print(e)" $Credenciales } | Out-String).Trim()
    }
    if (-not $fallo) {
      try { $creds = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($Credenciales)) } catch { $fallo = "no es JSON" }
    }
    if ($fallo) {
      Aviso "No se puede leer: $fallo"
      [void]$problemas.Add("Corrige credentials.json con '2 - Credenciales': cada valor entre comillas, una coma entre líneas y ninguna tras la última, como en la plantilla.")
    } else {
      foreach ($plataforma in @("statsbomb", "skillcorner")) {
        $c = $creds.$plataforma
        if ($c -and $c.username -and $c.password) { Bien "${plataforma}: usuario $($c.username) y contraseña rellenos" }
        else { Aviso "${plataforma}: falta el usuario o la contraseña" }
      }
      if ($creds.anthropic) { Bien "anthropic: clave rellena" } else { Write-Host "    anthropic: vacía (solo hace falta para los textos con IA)" }
      if (-not ($creds.statsbomb -and $creds.statsbomb.username -and $creds.statsbomb.password)) {
        [void]$problemas.Add("Rellena usuario y contraseña de StatsBomb con '2 - Credenciales'.")
      }
    }
  }

  Paso "Puente en http://127.0.0.1:$Puerto"
  if (Esta-En-Marcha) {
    Bien "Responde."
    $estado = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/api/sources/status" -TimeoutSec 5
    $ve = "no"; if ($estado.statsbomb) { $ve = "sí" }
    Write-Host "    Ve credenciales de StatsBomb: $ve"
    Write-Host "    Pidiendo el catálogo a StatsBomb (puede tardar unos segundos)..."
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Puerto/api/statsbomb/competitions" -TimeoutSec 90
      $texto = $r.Content
      if ($texto -is [byte[]]) { $texto = [System.Text.Encoding]::UTF8.GetString($texto) }
      $n = (ConvertFrom-Json -InputObject $texto).Count
      Bien "StatsBomb responde: $n competiciones."
    } catch {
      $codigo = 0
      if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
      if ($codigo -eq 503) {
        Aviso "StatsBomb: el puente no ve credenciales."
        [void]$problemas.Add("El puente no ve las credenciales de StatsBomb: revisa credentials.json y usa '3 - Reiniciar puente'.")
      } else {
        Aviso "StatsBomb falla (respuesta $codigo): $($_.Exception.Message)"
        Mostrar-Registro
        [void]$problemas.Add("StatsBomb rechaza la petición: si el registro dice 401, el usuario o la contraseña no son correctos.")
      }
    }
  } else {
    Aviso "No responde."
    $proceso = Proceso-Del-Puente
    if ($proceso) {
      $nombre = (Get-Process -Id $proceso -ErrorAction SilentlyContinue).ProcessName
      Aviso "El puerto $Puerto lo tiene otro programa: $nombre (PID $proceso)."
    }
    Mostrar-Registro
    if (Test-Path $Python) {
      Write-Host "    Probando las librerías del puente (unos segundos)..."
      # Los errores de Python a la salida normal, para leerlos aquí; lo que
      # onnxruntime escriba aparte sale en pantalla y no es un error del script.
      $salida = & { $ErrorActionPreference = "Continue"; & $Python -X utf8 -c "import sys; sys.stderr = sys.stdout; import fastapi, uvicorn, requests, rembg; print('ok')" }
      $texto = ($salida | Out-String).Trim()
      if ($LASTEXITCODE -eq 0) {
        Bien "Las librerías cargan bien."
        [void]$problemas.Add("El puente no está en marcha: abre '3 - Reiniciar puente'. Si sigue igual, 'Puente con ventana' muestra el error.")
      } else {
        ($texto -split "`n" | Select-Object -Last 6) | ForEach-Object { Write-Host "      $_" }
        if ($texto -match "DLL load failed|onnxruntime") {
          [void]$problemas.Add("A Windows le falta el Visual C++ Redistributable: instálalo desde https://aka.ms/vs/17/release/vc_redist.x64.exe y abre '3 - Reiniciar puente'.")
        } else {
          [void]$problemas.Add("Las librerías del puente no cargan: vuelve a abrir '1 - Instalar'.")
        }
      }
    }
  }

  Write-Host ""
  if ($problemas.Count -eq 0) {
    Write-Host "TODO BIEN: el puente lee StatsBomb." -ForegroundColor Green
  } else {
    Write-Host "QUÉ HACER:" -ForegroundColor Yellow
    foreach ($problema in $problemas) { Write-Host "  - $problema" -ForegroundColor Yellow }
  }
  Write-Host ""
  Write-Host "Abre la app con 'Abrir FOS Scout Lab' (http://127.0.0.1:$Puerto/). Desde la página de"
  Write-Host "github.io, Chrome tiene que permitir el acceso a la red local (candado de la barra de direcciones)."
}

function Instalar {
  Paso "1/6 Python"
  $base = Instalar-Python
  Paso "2/6 Entorno de Python en $Venv"
  if (-not (Test-Path $Python)) {
    $codigo = Ejecutar $base.Exe (@($base.Args) + @("-m", "venv", $Venv))
    if ($codigo -ne 0) { throw "No pude crear el entorno de Python." }
  }
  Bien "Entorno listo."
  Paso "3/6 Librerías (rembg, FastAPI, uvicorn): la primera vez tarda unos minutos"
  Ejecutar $Python @("-m", "pip", "install", "--upgrade", "pip", "--quiet", "--disable-pip-version-check") | Out-Null
  $codigo = Ejecutar $Python (@("-m", "pip", "install", "--upgrade", "--disable-pip-version-check") + $Dependencias)
  if ($codigo -ne 0) { throw "Falló la instalación de las librerías. Revisa la conexión y vuelve a abrir '1 - Instalar'." }
  Bien "Librerías instaladas."
  Paso "4/6 El puente"
  Copiar-Puente
  Paso "5/6 Credenciales"
  $nuevas = Preparar-Credenciales
  Paso "6/6 Arranque automático y primera puesta en marcha"
  Parar
  Escribir-Lanzador
  Arrancar
  Write-Host ""
  Write-Host "Listo. La app con todos los datos: http://127.0.0.1:$Puerto/" -ForegroundColor Green
  if ($nuevas) {
    Write-Host ""
    Aviso "Se abre el archivo de credenciales: rellena usuario y contraseña de StatsBomb y SkillCorner"
    Aviso "(y la clave de Anthropic si quieres los textos con IA), guarda y usa '3 - Reiniciar puente'."
    Start-Process notepad.exe "`"$Credenciales`""
  }
  Start-Process "http://127.0.0.1:$Puerto/"
}

function Actualizar {
  Paso "Bajando la última versión del puente"
  Copiar-Puente -DeGitHub
  Parar
  Arrancar
}

function Desinstalar {
  Parar
  if (Test-Path $Lanzador) {
    Remove-Item -Force $Lanzador
    Bien "Quitado el arranque automático."
  }
  Write-Host "    El entorno ($Venv) y tus credenciales ($Datos) se quedan; bórralos a mano si ya no los quieres."
}

try {
  switch ($Accion) {
    "instalar" { Instalar }
    "arrancar" { Arrancar }
    "parar" { Parar }
    "reiniciar" { Parar; Arrancar }
    "ventana" { Arrancar-Con-Ventana }
    "comprobar" { Comprobar }
    "credenciales" { Preparar-Credenciales | Out-Null; Start-Process notepad.exe "`"$Credenciales`"" }
    "actualizar" { Actualizar }
    "desinstalar" { Desinstalar }
    default { throw "Acción desconocida: $Accion" }
  }
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
