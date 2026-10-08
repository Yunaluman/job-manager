param([ValidateSet('Protect', 'Unprotect')][string]$Operation)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $taskBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
    $taskScope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    if ($Operation -eq 'Protect') {
        $taskResult = [System.Security.Cryptography.ProtectedData]::Protect($taskBytes, $null, $taskScope)
    } else {
        $taskResult = [System.Security.Cryptography.ProtectedData]::Unprotect($taskBytes, $null, $taskScope)
    }
    [Console]::Out.Write([Convert]::ToBase64String($taskResult))
} catch {
    # Never emit input, decrypted data, or exception details.
    [Console]::Error.Write('Windows credential protection failed.')
    exit 1
}
