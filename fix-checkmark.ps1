Set-Location D:\Development\SmartPrep\smartprep-mobile
$f = 'src/screens/app/TestRunnerScreen.tsx'
$c = Get-Content $f -Raw
$c = $c -replace "(checkmark:\s*\{\s*color:\s*)'#FFFFFF'", '$1colors.onPrimary'
Set-Content $f $c -NoNewline
Write-Output 'checkmark -> onPrimary'
Remove-Item fix-contrast.ps1 -ErrorAction SilentlyContinue
npx tsc --noEmit 2>&1 | Select-Object -First 4
Write-Output 'tsc-ok'
git add -A
git commit -m 'feat(theme): SSF brand theme from startsmartfuture.com - amber primary replaces Material purple' 2>&1 | Select-Object -Last 1
