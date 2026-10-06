# Ensures the local PostgreSQL Windows service is running before the
# backend starts. Starts it if stopped; does nothing if already running.

$serviceName = "postgresql-x64-18"

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $service) {
    Write-Error "PostgreSQL service '$serviceName' was not found. Is PostgreSQL installed?"
    exit 1
}

if ($service.Status -ne "Running") {
    Write-Host "Starting PostgreSQL service '$serviceName'..."
    try {
        Start-Service -Name $serviceName -ErrorAction Stop
    } catch {
        # Starting a Windows service requires admin rights. Retry once in an
        # elevated PowerShell (shows a UAC prompt).
        Write-Host "Administrator rights are required - requesting elevation..."
        try {
            Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList `
                "-NoProfile", "-Command", "Start-Service -Name '$serviceName'"
        } catch {
            Write-Error "Could not start '$serviceName'. Run this terminal as Administrator, or start the service from services.msc."
            exit 1
        }
    }
    $service.Refresh()
    try {
        $service.WaitForStatus("Running", "00:00:30")
    } catch {
        Write-Error "PostgreSQL service '$serviceName' did not reach the Running state."
        exit 1
    }
    Write-Host "PostgreSQL service is now running."
} else {
    Write-Host "PostgreSQL service '$serviceName' is already running."
}
