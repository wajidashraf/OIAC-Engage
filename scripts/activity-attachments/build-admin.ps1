param([string]$SdkDirectory = "$env:LOCALAPPDATA/Microsoft/PowerAppsCLI/Microsoft.PowerApps.CLI.2.11.2/tools")
$ErrorActionPreference = 'Stop'
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$helper = Join-Path $app '../.superpowers/press-coverage/sdk-helper/DataverseReadOnly.exe'
$output = Join-Path $app '.superpowers/activity-post-attachments/admin'
if (-not (Test-Path -LiteralPath $helper)) { throw 'The existing OIAC SDK session helper is required.' }
New-Item -ItemType Directory -Path $output -Force | Out-Null
Copy-Item -LiteralPath $helper -Destination $output -Force
Copy-Item -LiteralPath ($helper + '.config') -Destination (Join-Path $output 'ManageActivityAttachmentFlow.exe.config') -Force
$references = @("/r:$helper", "/r:$SdkDirectory/Microsoft.Xrm.Sdk.dll", "/r:$SdkDirectory/Microsoft.Crm.Sdk.Proxy.dll", "/r:$SdkDirectory/Microsoft.PowerPlatform.Dataverse.Client.dll", "/r:$SdkDirectory/Microsoft.Identity.Client.dll", "/r:$SdkDirectory/Newtonsoft.Json.dll", '/r:System.ServiceModel.dll', '/r:C:/Windows/Microsoft.NET/assembly/GAC_MSIL/netstandard/v4.0_2.0.0.0__cc7b13ffcd2ddd51/netstandard.dll')
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:exe "/out:$output/ManageActivityAttachmentFlow.exe" @references (Join-Path $PSScriptRoot 'ManageActivityAttachmentFlow.cs')
if ($LASTEXITCODE -ne 0) { throw 'Flow administrative helper compilation failed.' }
Write-Output 'Compiled the exact-Test/UAT-guarded flow helper. No cloud records changed.'
