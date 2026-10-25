# FOS Scout Lab: el puente local en Windows, en un solo archivo.
#
# `npm run bg:windows` mete este script y bg-server.py en "FOS Scout Lab.cmd".
# Un doble clic instala lo que falte, pone el puente al día, usa las
# credenciales ya guardadas, lo arranca, comprueba que StatsBomb responde y
# abre la app en http://127.0.0.1:7001/. Vale igual la primera vez que cada día.
#
# Otras acciones, desde una consola:  "FOS Scout Lab.cmd" <acción>
#   comprobar     revisa instalación, credenciales, puente y StatsBomb
#   reiniciar     lo para y lo vuelve a arrancar
#   ventana       lo arranca a la vista, con el registro en pantalla
#   credenciales  te pide usuario y contraseña de StatsBomb de nuevo
#   actualizar    baja la última versión del puente de GitHub (main)
#   desinstalar   quita el arranque automático y lo para
#
# Escrito para el PowerShell 5.1 que trae Windows: nada de ?? ni &&. Y
# PowerShell no distingue mayúsculas: $python sería el mismo $Python.

param([string]$Accion = "todo", [string]$Archivo = "")
if (-not $Accion) { $Accion = "todo" }

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
# Lo que dejan dicho las funciones. En un diccionario y no en $script:, porque
# dentro del .cmd este script corre como bloque y $script: sería otro ámbito.
$Ultimo = @{ FalloLibrerias = ""; StatsBomb401 = $false }

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
    throw "No hay Python 3.11 ni winget para instalarlo. Instala Python 3.11 desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH') y vuelve a abrir FOS Scout Lab."
  }
  Aviso "No hay Python 3.11. Lo instalo con winget (puede pedir permiso)."
  Ejecutar "winget" @("install", "-e", "--id", "Python.Python.3.11", "--scope", "user", "--accept-package-agreements", "--accept-source-agreements") | Out-Null
  # winget deja el PATH nuevo para las ventanas que se abran después: se recarga aquí.
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
  $base = Buscar-Python
  if (-not $base) { throw "Python se instaló pero no lo encuentro. Cierra esta ventana y vuelve a abrir FOS Scout Lab." }
  return $base
}

# Si cargan las librerías del puente. Es lo que suele tumbarlo al arrancar;
# el error queda en $Ultimo.FalloLibrerias para enseñarlo.
function Librerias-Cargan {
  if (-not (Test-Path $Python)) { return $false }
  # Los errores de Python a la salida normal, para leerlos aquí; lo que
  # onnxruntime escriba aparte sale en pantalla y no es un error del script.
  $salida = & { $ErrorActionPreference = "Continue"; & $Python -X utf8 -c "import sys; sys.stderr = sys.stdout; import fastapi, uvicorn, requests, rembg; print('ok')" }
  $Ultimo.FalloLibrerias = ($salida | Out-String).Trim()
  return ($LASTEXITCODE -eq 0)
}

function Mostrar-Fallo-Librerias {
  ($Ultimo.FalloLibrerias -split "`n" | Select-Object -Last 6) | ForEach-Object { Write-Host "      $_" }
}

function Instalar-Librerias {
  Aviso "Instalo las librerías (rembg, FastAPI, uvicorn): la primera vez tarda unos minutos."
  Ejecutar $Python @("-m", "pip", "install", "--upgrade", "pip", "--quiet", "--disable-pip-version-check") | Out-Null
  $codigo = Ejecutar $Python (@("-m", "pip", "install", "--upgrade", "--disable-pip-version-check") + $Dependencias)
  if ($codigo -ne 0) { throw "Falló la instalación de las librerías. Revisa la conexión y vuelve a abrir FOS Scout Lab." }
  if (-not (Librerias-Cargan)) {
    Mostrar-Fallo-Librerias
    if ($Ultimo.FalloLibrerias -match "DLL load failed|onnxruntime") {
      throw "A Windows le falta el Visual C++ Redistributable: instálalo desde https://aka.ms/vs/17/release/vc_redist.x64.exe y vuelve a abrir FOS Scout Lab."
    }
    throw "Las librerías se instalaron pero no cargan (el error está arriba)."
  }
  Bien "Librerías instaladas."
}

# El bg-server.py que viene con este script: dentro del propio .cmd,
# comprimido tras su marca, o junto al script si se usa desde el repositorio.
function Puente-Incluido {
  if ($Archivo -and (Test-Path $Archivo)) {
    $texto = [System.IO.File]::ReadAllText($Archivo, [System.Text.Encoding]::UTF8)
    $marca = "#" + "#PUENTE##"
    $i = $texto.IndexOf($marca)
    if ($i -ge 0) {
      $entrada = New-Object System.IO.MemoryStream(, [Convert]::FromBase64String($texto.Substring($i + $marca.Length)))
      $gzip = New-Object System.IO.Compression.GZipStream($entrada, [System.IO.Compression.CompressionMode]::Decompress)
      $salida = New-Object System.IO.MemoryStream
      $gzip.CopyTo($salida)
      $gzip.Dispose()
      return , $salida.ToArray()
    }
  }
  if ($PSScriptRoot) {
    $local = Join-Path $PSScriptRoot "..\bg-server.py"
    if (Test-Path $local) { return , [System.IO.File]::ReadAllBytes($local) }
  }
  return $null
}

# Deja el puente en su carpeta. Devuelve si ha cambiado, para reiniciarlo.
function Copiar-Puente([switch]$DeGitHub) {
  New-Item -ItemType Directory -Force -Path $CarpetaPuente | Out-Null
  $destino = Join-Path $CarpetaPuente "bg-server.py"
  $nuevo = $null
  if (-not $DeGitHub) { $nuevo = Puente-Incluido }
  if ($null -eq $nuevo) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $UrlPuente -OutFile $destino
      Bien "Puente descargado de GitHub."
      return $true
    } catch {
      if (Test-Path $destino) {
        Aviso "Sin conexión con GitHub: sigo con el puente que ya estaba."
        return $false
      }
      throw "No pude descargar el puente de GitHub: $($_.Exception.Message)"
    }
  }
  if ((Test-Path $destino) -and ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($destino)) -eq [Convert]::ToBase64String($nuevo))) {
    Bien "Puente al día."
    return $false
  }
  [System.IO.File]::WriteAllBytes($destino, $nuevo)
  Bien "Puente actualizado en $destino"
  return $true
}

# El texto de un archivo en la codificación que tenga: UTF-8 (con o sin BOM),
# UTF-16 (el "Unicode" del Bloc de notas) o ANSI.
function Leer-Texto([string]$Ruta) {
  $bytes = [System.IO.File]::ReadAllBytes($Ruta)
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2) }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2) }
  try {
    return (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes).TrimStart([char]0xFEFF)
  } catch {
    return [System.Text.Encoding]::Default.GetString($bytes)
  }
}

function Par([string]$Usuario, [string]$Clave) {
  return [pscustomobject]@{ Usuario = $Usuario.Trim(); Clave = $Clave }
}

$NombresUsuario = "username|user|usuario|email|e-mail|correo|login"
$NombresClave = "password|pass|contraseña|contrasena|clave"

# El valor que sigue a una etiqueta ("usuario: x", "password": "y").
function Valor-Etiquetado([string]$Tramo, [string]$Nombres) {
  $m = [regex]::Match($Tramo, "(?i)`"?\b($Nombres)\b`"?\s*[:=]\s*`"((?:[^`"\\]|\\.)*)`"")
  if ($m.Success -and $m.Groups[2].Value) { return ($m.Groups[2].Value -replace '\\(.)', '$1') }
  $m = [regex]::Match($Tramo, "(?i)\b($Nombres)\b\s*[:=]\s*([^\s`",}]+)")
  if ($m.Success) { return $m.Groups[2].Value }
  return $null
}

# Usuario y contraseña de una plataforma dentro de un texto cualquiera: el JSON
# de la plantilla (aunque las claves se llamen de otra forma o haya una coma de
# más), "usuario:contraseña" en una línea, o etiquetas sueltas cerca del nombre.
function Par-En-Texto([string]$Texto, [string]$Plataforma) {
  $json = $null
  try { $json = ConvertFrom-Json -InputObject $Texto } catch { }
  if ($json) {
    $valor = $null
    foreach ($p in $json.PSObject.Properties) { if (($p.Name -replace '[^a-zA-Z]', '') -eq $Plataforma) { $valor = $p.Value } }
    if ($valor -is [string] -and $valor.Contains(":")) {
      $i = $valor.IndexOf(":")
      if ($i -gt 0 -and $i -lt $valor.Length - 1) { return Par $valor.Substring(0, $i) $valor.Substring($i + 1) }
    } elseif ($valor) {
      $u = $null; $c = $null
      foreach ($p in $valor.PSObject.Properties) {
        if ($p.Name -match "^($NombresUsuario)$" -and $p.Value) { $u = [string]$p.Value }
        if ($p.Name -match "^($NombresClave)$" -and $p.Value) { $c = [string]$p.Value }
      }
      if ($u -and $c) { return Par $u $c }
    }
  }
  # Texto libre: lo que va del nombre de la plataforma a la siguiente.
  $i = $Texto.IndexOf($Plataforma, [System.StringComparison]::OrdinalIgnoreCase)
  if ($i -lt 0) { return $null }
  $tramo = $Texto.Substring($i + $Plataforma.Length)
  $siguiente = [regex]::Match($tramo, "(?i)statsbomb|skillcorner|anthropic|api-football|wyscout")
  if ($siguiente.Success) { $tramo = $tramo.Substring(0, $siguiente.Index) }
  $m = [regex]::Match($tramo, '^[\s"'':=]*([^\s":,{}]+):([^\s",{}]+)')
  if ($m.Success) { return Par $m.Groups[1].Value $m.Groups[2].Value }
  $u = Valor-Etiquetado $tramo $NombresUsuario
  $c = Valor-Etiquetado $tramo $NombresClave
  if ($u -and $c) { return Par $u $c }
  return $null
}

# Las credenciales de StatsBomb estén donde estén: primero credentials.json y
# después el texto más reciente que hable de StatsBomb en el Escritorio,
# Documentos, Descargas o la carpeta de este archivo.
function Buscar-Credenciales {
  $archivos = New-Object System.Collections.ArrayList
  if (Test-Path $Credenciales) { [void]$archivos.Add((Get-Item $Credenciales)) }
  $carpetas = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("MyDocuments"), (Join-Path $Casa "Downloads"), $Datos)
  if ($Archivo) { $carpetas += (Split-Path -Parent $Archivo) }
  $otros = foreach ($carpeta in ($carpetas | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)) {
    Get-ChildItem -Path $carpeta -File -ErrorAction SilentlyContinue |
      Where-Object { (@(".txt", ".json", "") -contains $_.Extension.ToLower()) -and $_.Length -lt 65536 -and $_.FullName -ne $Credenciales }
  }
  foreach ($otro in ($otros | Sort-Object LastWriteTime -Descending)) { [void]$archivos.Add($otro) }
  foreach ($candidato in $archivos) {
    $texto = Leer-Texto $candidato.FullName
    if ($texto -notmatch "(?i)statsbomb") { continue }
    $sb = Par-En-Texto $texto "statsbomb"
    if ($sb) { return [pscustomobject]@{ Origen = $candidato.FullName; Texto = $texto; StatsBomb = $sb } }
  }
  return $null
}

# Las pide en esta misma ventana: la contraseña no se ve al escribirla.
function Pedir-Credenciales {
  Aviso "Escribe tus credenciales de StatsBomb una vez y quedan guardadas (la contraseña no se ve al escribirla)."
  $usuario = [string](Read-Host "    Usuario de StatsBomb (el mismo que en el Mac)")
  $segura = Read-Host "    Contraseña de StatsBomb" -AsSecureString
  $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
  if (-not $usuario.Trim() -or -not $clave) { return $null }
  return [pscustomobject]@{ Origen = "lo que has escrito aquí"; Texto = ""; StatsBomb = (Par $usuario $clave) }
}

# credentials.json en la forma exacta que lee el puente ("statsbomb" en
# minúsculas, username y password, UTF-8 sin BOM), sin perder lo demás que haya.
function Guardar-Credenciales($Encontradas) {
  New-Item -ItemType Directory -Force -Path $Datos | Out-Null
  $antes = ""
  if (Test-Path $Credenciales) { $antes = Leer-Texto $Credenciales }
  $fuentes = @($Encontradas.Texto, $antes) | Where-Object { $_ }
  $sc = $null; $anthropic = ""; $apiFootball = ""
  foreach ($fuente in $fuentes) {
    if (-not $sc) { $sc = Par-En-Texto $fuente "skillcorner" }
    if (-not $anthropic) { $m = [regex]::Match($fuente, "sk-ant-[A-Za-z0-9_\-]+"); if ($m.Success) { $anthropic = $m.Value } }
    if (-not $apiFootball) {
      $json = $null
      try { $json = ConvertFrom-Json -InputObject $fuente } catch { }
      if ($json -and $json."api-football" -is [string]) { $apiFootball = $json."api-football".Trim() }
    }
  }
  $scUsuario = ""; $scClave = ""
  if ($sc) { $scUsuario = $sc.Usuario; $scClave = $sc.Clave }
  $nuevo = [ordered]@{
    statsbomb = [ordered]@{ username = $Encontradas.StatsBomb.Usuario; password = $Encontradas.StatsBomb.Clave }
    skillcorner = [ordered]@{ username = $scUsuario; password = $scClave }
    anthropic = $anthropic
    "api-football" = $apiFootball
  }
  $json = ($nuevo | ConvertTo-Json -Depth 4) -replace "`r`n", "`n"
  if ($json.Trim() -ne $antes.Trim()) {
    if ($antes) { Copy-Item -Force $Credenciales "$Credenciales.bak" }
    [System.IO.File]::WriteAllText($Credenciales, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
  }
}

# credentials.json tal como lo leerá el puente. Se valida con su mismo Python:
# PowerShell perdona cosas, como una coma de más al final, que a Python le
# hacen tirar el archivo entero.
function Leer-Credenciales {
  if (-not (Test-Path $Credenciales)) { return [pscustomobject]@{ Fallo = "no existe"; Datos = $null } }
  $fallo = ""
  if (Test-Path $Python) {
    $fallo = (& { $ErrorActionPreference = "Continue"; & $Python -X utf8 -c "import json, sys; sys.excepthook = lambda t, v, b: print(v); json.loads(open(sys.argv[1], encoding='utf-8-sig').read())" $Credenciales } | Out-String).Trim()
  }
  $leidas = $null
  if (-not $fallo) {
    try { $leidas = ConvertFrom-Json -InputObject (Leer-Texto $Credenciales) } catch { $fallo = "no es JSON" }
  }
  return [pscustomobject]@{ Fallo = $fallo; Datos = $leidas }
}

function Tiene-Plataforma($Leidas, [string]$Plataforma) {
  $c = $null
  if ($Leidas) { $c = $Leidas.$Plataforma }
  return [bool]($c -and $c.username -and $c.password)
}

# Las credenciales que ya guardaste, donde estén y como estén escritas: las
# encuentra, las deja en credentials.json tal como las lee el puente y solo
# si no hay ningunas te las pide aquí mismo.
function Asegurar-Credenciales([switch]$Pedir) {
  $encontradas = $null
  if (-not $Pedir) { $encontradas = Buscar-Credenciales }
  if (-not $encontradas) {
    if (-not $Pedir) { Aviso "No encuentro credenciales de StatsBomb en $Credenciales ni en el Escritorio, Documentos o Descargas." }
    $encontradas = Pedir-Credenciales
  }
  if (-not $encontradas) {
    Aviso "Sin usuario o contraseña de StatsBomb: la app abrirá, pero sin sus datos."
    return
  }
  Guardar-Credenciales $encontradas
  $sb = $encontradas.StatsBomb
  Bien "StatsBomb: usuario $($sb.Usuario), contraseña de $($sb.Clave.Length) caracteres ($($encontradas.Origen))."
  $leidas = Leer-Credenciales
  if (Tiene-Plataforma $leidas.Datos "skillcorner") { Bien "SkillCorner: usuario $($leidas.Datos.skillcorner.username)" } else { Write-Host "    SkillCorner: sin credenciales" }
  if ($leidas.Datos.anthropic) { Bien "Anthropic: clave guardada" } else { Write-Host "    Anthropic: sin clave (solo hace falta para los textos con IA)" }
  Bien "Guardadas para el puente en $Credenciales"
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
  Bien "Arranca solo al iniciar sesión ($Lanzador)."
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
  if (-not (Test-Path $Python)) { throw "El puente no está instalado: abre FOS Scout Lab con doble clic." }
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
  Aviso "Lo he arrancado pero no responde."
  Mostrar-Registro
}

function Arrancar-Con-Ventana {
  if (Esta-En-Marcha) {
    Aviso "Ya hay un puente en marcha en el puerto ${Puerto}: lo paro para verlo aquí."
    Parar
  }
  if (-not (Test-Path $Python)) { throw "El puente no está instalado: abre FOS Scout Lab con doble clic." }
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
  }
}

# De abajo arriba, todo lo que hace falta para que la app lea StatsBomb, con un
# veredicto al final. No muestra contraseñas ni claves.
function Comprobar {
  $problemas = New-Object System.Collections.ArrayList
  $Ultimo.StatsBomb401 = $false

  $piezas = [ordered]@{ "Python del entorno" = $Python; "Puente" = (Join-Path $CarpetaPuente "bg-server.py"); "Arranque al iniciar sesión" = $Lanzador }
  foreach ($pieza in $piezas.GetEnumerator()) {
    if (-not (Test-Path $pieza.Value)) {
      Aviso "Falta $($pieza.Key) ($($pieza.Value))."
      [void]$problemas.Add("Falta '$($pieza.Key)': abre FOS Scout Lab con doble clic y lo instala.")
    }
  }

  $leidas = Leer-Credenciales
  if ($leidas.Fallo) {
    Aviso "credentials.json no se puede leer: $($leidas.Fallo)"
    [void]$problemas.Add("Corrige $Credenciales (cada valor entre comillas, una coma entre líneas y ninguna tras la última).")
  } elseif (-not (Tiene-Plataforma $leidas.Datos "statsbomb")) {
    [void]$problemas.Add("Rellena usuario y contraseña de StatsBomb en $Credenciales.")
  }

  if (Esta-En-Marcha) {
    $estado = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/api/sources/status" -TimeoutSec 5
    if ($estado.statsbomb) {
      Write-Host "    Pidiendo el catálogo a StatsBomb (puede tardar unos segundos)..."
      try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Puerto/api/statsbomb/competitions" -TimeoutSec 90
        $texto = $r.Content
        if ($texto -is [byte[]]) { $texto = [System.Text.Encoding]::UTF8.GetString($texto) }
        Bien "StatsBomb responde: $((ConvertFrom-Json -InputObject $texto).Count) competiciones."
      } catch {
        $fallo = $_.Exception.Message
        Start-Sleep -Milliseconds 500
        $cola = @()
        if (Test-Path $Registro) { $cola = @(Get-Content -Tail 40 $Registro) }
        if ($cola -match "401") {
          Aviso "StatsBomb dice que el usuario o la contraseña no son correctos (401)."
          $Ultimo.StatsBomb401 = $true
          [void]$problemas.Add("Usuario o contraseña de StatsBomb incorrectos: usa los mismos que en el Mac (Llavero, fos-scouting > statsbomb).")
        } else {
          Aviso "StatsBomb falla: $fallo"
          Mostrar-Registro
          [void]$problemas.Add("StatsBomb no devuelve el catálogo: el motivo está en el registro de arriba.")
        }
      }
    } elseif ($problemas.Count -eq 0) {
      [void]$problemas.Add("El puente no ve las credenciales de StatsBomb: revisa $Credenciales y vuelve a abrir FOS Scout Lab.")
    }
  } else {
    Aviso "El puente no responde."
    $proceso = Proceso-Del-Puente
    if ($proceso) {
      $nombre = (Get-Process -Id $proceso -ErrorAction SilentlyContinue).ProcessName
      Aviso "El puerto $Puerto lo tiene otro programa: $nombre (PID $proceso)."
    }
    Mostrar-Registro
    if (Librerias-Cargan) {
      [void]$problemas.Add("El puente no está en marcha. Para ver el error: abre una consola y ejecuta  `"FOS Scout Lab.cmd`" ventana")
    } elseif (Test-Path $Python) {
      Mostrar-Fallo-Librerias
      if ($Ultimo.FalloLibrerias -match "DLL load failed|onnxruntime") {
        [void]$problemas.Add("A Windows le falta el Visual C++ Redistributable: instálalo desde https://aka.ms/vs/17/release/vc_redist.x64.exe y vuelve a abrir FOS Scout Lab.")
      } else {
        [void]$problemas.Add("Las librerías del puente no cargan: vuelve a abrir FOS Scout Lab.")
      }
    }
  }

  Write-Host ""
  if ($problemas.Count -eq 0) {
    Write-Host "TODO BIEN: el puente está en marcha y lee StatsBomb." -ForegroundColor Green
  } else {
    Write-Host "QUÉ FALTA:" -ForegroundColor Yellow
    foreach ($problema in $problemas) { Write-Host "  - $problema" -ForegroundColor Yellow }
  }
  Write-Host ""
  Write-Host "La app: http://127.0.0.1:$Puerto/  (desde github.io, Chrome tiene que permitir"
  Write-Host "el acceso a la red local: candado de la barra de direcciones)."
}

# Todo de una vez. Cada paso salta lo que ya está hecho, así que el mismo doble
# clic sirve para instalar, para arreglar y para el día a día.
function Todo {
  Paso "1/5 Python y librerías"
  if (-not (Test-Path $Python)) {
    $base = Instalar-Python
    $codigo = Ejecutar $base.Exe (@($base.Args) + @("-m", "venv", $Venv))
    if ($codigo -ne 0) { throw "No pude crear el entorno de Python." }
    Bien "Entorno creado en $Venv"
  }
  if (Librerias-Cargan) { Bien "Librerías listas." } else { Instalar-Librerias }

  Paso "2/5 El puente"
  $cambiado = Copiar-Puente

  Paso "3/5 Credenciales"
  Asegurar-Credenciales

  Paso "4/5 Arranque"
  Escribir-Lanzador
  if ($cambiado -and (Esta-En-Marcha)) {
    Aviso "Reinicio el puente que estaba en marcha para usar el nuevo."
    Parar
  }
  Arrancar

  Paso "5/5 Comprobación"
  Comprobar
  # Si StatsBomb las rechaza, se piden aquí mismo y se vuelve a probar: el
  # puente lee el archivo en cada petición, no hace falta reiniciarlo.
  for ($intento = 0; $Ultimo.StatsBomb401 -and $intento -lt 2; $intento++) {
    Paso "Credenciales de StatsBomb, otra vez"
    Asegurar-Credenciales -Pedir
    Comprobar
  }
  Start-Process "http://127.0.0.1:$Puerto/"
}

function Actualizar {
  Paso "Bajando la última versión del puente"
  Copiar-Puente -DeGitHub | Out-Null
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
    "todo" { Todo }
    "instalar" { Todo }
    "comprobar" { Comprobar }
    "reiniciar" { Parar; Arrancar }
    "ventana" { Arrancar-Con-Ventana }
    "parar" { Parar }
    "credenciales" { Asegurar-Credenciales -Pedir; if (Esta-En-Marcha) { Comprobar } }
    "actualizar" { Actualizar }
    "desinstalar" { Desinstalar }
    default { throw "Acción desconocida: $Accion" }
  }
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
