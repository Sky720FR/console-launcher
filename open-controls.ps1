# Ouvre un émulateur (Eden / Fritchii, basés sur le même code) directement sur
# la page de configuration des manettes : Emulation → Configure... → Controls.
# Utilise l'automatisation de l'interface Windows (UI Automation), aucun clic de souris.
param(
  [Parameter(Mandatory)][string]$Exe,
  [switch]$Probe,  # affiche les éléments trouvés (pour le débogage)
  [string]$Log = '',
  [switch]$Wait   # attend la fermeture de l'émulateur (pour que le menu revienne ensuite)
)
function L([string]$m) { if ($Log) { Add-Content -Path $Log -Value ("{0:HH:mm:ss.fff} {1}" -f (Get-Date), $m) } }
function Finish([int]$code) { if ($Wait -and $script:p) { try { $script:p.WaitForExit() } catch {} }; exit $code }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A  = [System.Windows.Automation.AutomationElement]
$T  = [System.Windows.Automation.TreeScope]
$PC = [System.Windows.Automation.PropertyCondition]

function Wait-Until([scriptblock]$Test, [int]$Seconds = 20) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) { $r = & $Test; if ($r) { return $r }; Start-Sleep -Milliseconds 250 }
  return $null
}
function Find-ByName($Root, [string]$Pattern, [string]$Type = '') {
  foreach ($e in $Root.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    try {
      if ($e.Current.Name -match $Pattern -and ($Type -eq '' -or $e.Current.ControlType.ProgrammaticName -match $Type)) { return $e }
    } catch {}
  }
  return $null
}
function Press($e) {
  foreach ($pat in @([System.Windows.Automation.InvokePattern]::Pattern,
                     [System.Windows.Automation.SelectionItemPattern]::Pattern,
                     [System.Windows.Automation.ExpandCollapsePattern]::Pattern)) {
    $o = $null
    if ($e.TryGetCurrentPattern($pat, [ref]$o)) {
      if ($o -is [System.Windows.Automation.InvokePattern]) { $o.Invoke() }
      elseif ($o -is [System.Windows.Automation.SelectionItemPattern]) { $o.Select() }
      else { $o.Expand() }
      return $true
    }
  }
  return $false
}

# 1) Démarre l'émulateur (ou réutilise celui déjà ouvert)
$name = [IO.Path]::GetFileNameWithoutExtension($Exe)
$p = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { $p = Start-Process $Exe -WorkingDirectory (Split-Path $Exe) -PassThru }
$hwnd = Wait-Until { $p.Refresh(); if ($p.MainWindowHandle -ne 0) { $p.MainWindowHandle } } 30
if (-not $hwnd) { Write-Output 'ERR: fenêtre introuvable'; Finish 1 }
Start-Sleep -Milliseconds 1500
$win = $A::FromHandle($hwnd)
$procCond = New-Object $PC($A::ProcessIdProperty, $p.Id)

L 'fenetre principale ok'
# 2) Ouvre les réglages par le menu. Selon l'émulateur :
#    Eden     : Emulation → Configure...
#    Fritchii : File → Settings...   (sa barre de menus est cachée mais toujours présente)
$routes = @(
  @{ Menu = '^(Emulation|Émulation)$'; Item = '^Configur(e|er)\.\.\.$' },
  @{ Menu = '^(File|Fichier)$';        Item = '^(Settings|Paramètres)\.\.\.$' }
)
$cfgItem = $null
foreach ($route in $routes) {
  $menu = Wait-Until { Find-ByName $win $route.Menu 'MenuItem' } 3
  if (-not $menu) { continue }
  $ec = $null
  if ($menu.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$ec)) { $ec.Expand() } else { Press $menu | Out-Null }
  Start-Sleep -Milliseconds 500
  L "menu $($route.Menu) ouvert"
  $cfgItem = Wait-Until {
    foreach ($e in $A::RootElement.FindAll($T::Descendants, $procCond)) {
      try { if ($e.Current.ControlType.ProgrammaticName -match 'MenuItem' -and $e.Current.Name -match $route.Item) { return $e } } catch {}
    }
  } 4
  if ($cfgItem) { break }
  try { $ec.Collapse() } catch {}
}
if (-not $cfgItem) { Write-Output 'ERR: menu des réglages introuvable'; Finish 3 }
# Le clic ouvre une fenêtre modale : Invoke() bloquerait l'automatisation jusqu'à sa fermeture.
# On fait donc un vrai clic de souris au centre de l'entrée du menu.
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(2,0,0,0,UIntPtr.Zero); mouse_event(4,0,0,0,UIntPtr.Zero); }
}
'@
$r = $cfgItem.Current.BoundingRectangle
[Mouse]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))

L 'Configure... clique'
# 3) Fenêtre de configuration → onglet Controls
$dlg = Wait-Until {
  foreach ($w in $A::RootElement.FindAll($T::Children, $procCond)) {
    try { if ($w.Current.NativeWindowHandle -ne $hwnd -and $w.Current.Name -match 'Config|Settings|Paramètres') { return $w } } catch {}
  }
  # certaines versions ouvrent la fenêtre comme enfant de la fenêtre principale
  # (c'est le cas d'Eden : "Eden Configuration" est une fenêtre enfant)
  foreach ($w in $win.FindAll($T::Children, (New-Object $PC($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)))) {
    try { if ($w.Current.Name -match 'Config|Settings|Paramètres') { return $w } } catch {}
  }
} 10
if (-not $dlg) { Write-Output 'ERR: fenêtre de configuration introuvable'; Finish 4 }

L 'dialogue trouve'
if ($Probe) {
  foreach ($e in $dlg.FindAll($T::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    try { if ($e.Current.ControlType.ProgrammaticName -match 'ListItem|TreeItem|TabItem') { "$($e.Current.ControlType.ProgrammaticName) | $($e.Current.Name)" } } catch {}
  }
}
$ctl = Wait-Until { Find-ByName $dlg '^(Controls|Contrôles|Input|Entrées)$' 'ListItem|TreeItem|TabItem' } 5
if (-not $ctl) { Write-Output 'WARN: onglet Controls introuvable, fenêtre de configuration ouverte'; Finish 0 }
# Qt ne change pas de page avec une sélection "automatique" : on clique vraiment dessus
$r = $ctl.Current.BoundingRectangle
[Mouse]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
L 'Controls selectionne'
Write-Output 'OK'
Finish 0
