$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
npm run prepare:worker
if ($LASTEXITCODE -ne 0) { throw 'Worker preparation failed' }
dotnet restore solution/solution.cdsproj
if ($LASTEXITCODE -ne 0) { throw 'Solution restore failed' }
dotnet build solution/solution.cdsproj --no-restore -c Release -p:SolutionPackageType=Unmanaged -p:PcfBuildMode=production
if ($LASTEXITCODE -ne 0) { throw 'Solution build failed' }
New-Item -ItemType Directory -Force artifacts | Out-Null
Copy-Item solution/bin/Release/solution.zip artifacts/ZengroqPdfViewerWithHighlights_1_1_0_0_unmanaged.zip
& "$PSScriptRoot/verify-package.ps1"
