param([string]$SdkDirectory = "$env:LOCALAPPDATA/Microsoft/PowerAppsCLI/Microsoft.PowerApps.CLI.2.11.2/tools")
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$workspace = Split-Path -Parent (Split-Path -Parent $project)
$output = Join-Path $workspace '.superpowers/contact-directory-build'
$key = Join-Path $workspace '.superpowers/appointments-build/appointments.snk'
if (-not (Test-Path -LiteralPath $key)) { throw 'Existing appointments signing key is required; this build never creates or changes it.' }
New-Item -ItemType Directory -Force $output | Out-Null
$compiler = "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
$references = @("/r:$SdkDirectory/Microsoft.Xrm.Sdk.dll", '/r:System.Runtime.Serialization.dll', '/r:System.ServiceModel.dll', '/r:System.Xml.Linq.dll')
$source = Join-Path $PSScriptRoot 'ContactDirectoryPlugin.cs'
& $compiler /nologo /target:library /optimize+ "/keyfile:$key" "/out:$output/Oiac.Engage.ContactDirectory.dll" @references $source
if ($LASTEXITCODE -ne 0) { throw 'Contact directory plugin compilation failed.' }
Copy-Item -LiteralPath "$SdkDirectory/Microsoft.Xrm.Sdk.dll" -Destination $output -Force
& $compiler /nologo /target:exe "/out:$output/ContactDirectoryTests.exe" @references /r:System.Web.Extensions.dll $source (Join-Path $PSScriptRoot 'ContactDirectoryTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Contact directory test compilation failed.' }
& "$output/ContactDirectoryTests.exe"
if ($LASTEXITCODE -ne 0) { throw 'Contact directory tests failed.' }
Get-FileHash -Algorithm SHA256 "$output/Oiac.Engage.ContactDirectory.dll"
& "${env:ProgramFiles(x86)}\Microsoft SDKs\Windows\v10.0A\bin\NETFX 4.8 Tools\sn.exe" -vf "$output/Oiac.Engage.ContactDirectory.dll"
if ($LASTEXITCODE -ne 0) { throw 'Strong-name verification failed.' }
