---
name: Bug report
about: Report a problem with Chronicler
title: ''
labels: bug
---

**What happened?**
<!-- A clear description of the bug, including any error messages. -->

**Steps to reproduce**
1.
2.
3.

**Expected behavior**
<!-- What did you expect to happen instead? -->

**Environment**
- Chronicler version: <!-- e.g. 0.50.0 -->
- OS and version: <!-- e.g. Windows 11, macOS 14.5, Ubuntu 24.04 -->
- Install method: <!-- .msi / .dmg / .deb / .rpm / .AppImage / Flatpak -->

**Logs**
In Chronicler, open **Settings → Open Log Directory** and attach the most
recent `chronicler.YYYY-MM-DD.log` file (drag-and-drop into this issue).

---

<details>
<summary><b>Windows users: Chronicler crashed and closed itself with no error?</b></summary>

If Chronicler closed silently - no dialog, no error, no useful log entry -
that's a native crash that bypasses our normal logging. To capture a proper
crash dump that we can debug:

1. Open **Command Prompt as Administrator** and run this once (it tells
   Windows to save crash dumps for Chronicler going forward):

   ```
   reg add "HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\chronicler.exe" /v DumpType /t REG_DWORD /d 1 /f
   ```

2. Reproduce the crash.

3. Find the dump file at:

   ```
   %LOCALAPPDATA%\CrashDumps\chronicler.exe.<pid>.dmp
   ```

   (Paste that path into Explorer's address bar - it'll resolve to your
   own user folder. The file should be a few MB.)

4. Attach the `.dmp` file to this issue.

5. *(Optional)* To turn off dump collection later, run:

   ```
   reg delete "HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\chronicler.exe" /f
   ```

</details>
