param([int]$RestoreProfile = 4)
$ErrorActionPreference = 'Stop'
$taskDirectory = Join-Path $PSScriptRoot '../../.superpowers/activity-post-attachments'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
& pac auth select --index 5
if ($LASTEXITCODE -ne 0) { throw 'The saved OIAC authentication profile is unavailable.' }
try {
  $org = 'https://org97063a46.crm.dynamics.com/'
  $raw = (& pac env fetch --environment $org --xml '<fetch><entity name="workflow"><attribute name="clientdata"/><attribute name="ismanaged"/><filter><condition attribute="workflowid" operator="eq" value="3d2d6112-bcd2-f111-a059-000d3a35b61f"/></filter></entity></fetch>' | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the existing flow.' }
  $line = ($raw -split '\r?\n' | Where-Object { $_.Trim().StartsWith('{') } | Select-Object -First 1).Trim()
  $json = $line.Substring(0,$line.LastIndexOf('}')+1)
  $snapshot = Join-Path $taskDirectory 'original-flow-clientdata.json'
  if (-not (Test-Path -LiteralPath $snapshot)) { [IO.File]::WriteAllText($snapshot,$json) }
  $parsed = $json | ConvertFrom-Json
  [pscustomobject]@{ FlowSnapshot = $snapshot; TopLevelFields = $parsed.PSObject.Properties.Name } | ConvertTo-Json -Compress
  & pac env fetch --environment $org --xml '<fetch><entity name="connectionreference"><attribute name="connectionreferencelogicalname"/><attribute name="connectionreferencedisplayname"/><attribute name="connectionid"/><attribute name="connectorid"/></entity></fetch>'
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect connector references.' }
  $siteSnapshot = Join-Path $taskDirectory 'registration-inspection'
  & pac pages download-code-site --environment $org --path $siteSnapshot --webSiteId 'e7f400bd-1e04-4efa-b8b3-7a7a3b168662' --overwrite
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect current code-site registration.' }
  Get-Content -LiteralPath (Join-Path $siteSnapshot 'oiac-engage/.powerpages-site/cloud-flow-consumer/Upload-Activity-Channel-Post-Document.cloudflowconsumer.yml')
} finally { & pac auth select --index $RestoreProfile }
