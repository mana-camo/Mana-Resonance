using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Security.Principal;
using Microsoft.Win32;

namespace ManaResonanceUninstall
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            // 管理者権限（UAC）チェックと自動昇格再起動 (アンインストール時もProgramFilesやLMレジストリ消去に必要)
            bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (!isAdmin)
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Application.ExecutablePath;
                psi.Verb = "runas"; // 管理者権限への昇格を要求する
                try
                {
                    Process.Start(psi);
                    Application.Exit();
                    return;
                }
                catch
                {
                    // ユーザーが「いいえ」を押した場合はそのまま終了
                    Application.Exit();
                    return;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            DialogResult result = MessageBox.Show(
                "Mana Resonance を PC から完全にアンインストール（削除）しますか？",
                "Mana Resonance アンインストーラー",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (result == DialogResult.Yes)
            {
                try
                {
                    string exePath = Process.GetCurrentProcess().MainModule.FileName;
                    string installDir = Path.GetDirectoryName(exePath);

                    // 1. ショートカットの削除 (デスクトップ)
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string desktopLink = Path.Combine(desktopPath, "Mana Resonance.lnk");
                    if (File.Exists(desktopLink)) {
                        File.Delete(desktopLink);
                    }

                    // ショートカットの削除 (スタートメニュー - All Users)
                    string commonStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs");
                    string startMenuLink = Path.Combine(commonStartMenu, "Mana Resonance.lnk");
                    if (File.Exists(startMenuLink)) {
                        File.Delete(startMenuLink);
                    }

                    // ショートカットの削除 (スタートメニュー - Single User)
                    string userStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                    string userStartMenuLink = Path.Combine(userStartMenu, "Mana Resonance.lnk");
                    if (File.Exists(userStartMenuLink)) {
                        File.Delete(userStartMenuLink);
                    }

                    // 2. レジストリ (Uninstallエントリ) の削除 (LocalMachine)
                    using (RegistryKey uninstallKey = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (uninstallKey != null)
                        {
                            uninstallKey.DeleteSubKeyTree("ManaResonance", false);
                        }
                    }

                    // 3. レジストリ (CurrentUser) の削除 (念のため旧バージョンのクリーンアップ)
                    using (RegistryKey userUninstallKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (userUninstallKey != null)
                        {
                            userUninstallKey.DeleteSubKeyTree("ManaResonance", false);
                        }
                    }

                    MessageBox.Show(
                        "アンインストールが完了しました。\nアプリフォルダと関連ファイルを消去します。",
                        "成功",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );

                    // 4. 自分自身（uninstaller.exe）とインストールフォルダをクリーンアップするバッチファイルを起動
                    string tempBatch = Path.Combine(Path.GetTempPath(), "mana_resonance_cleanup.bat");
                    string batchContent = string.Format(
                        "@echo off\n" +
                        ":loop\n" +
                        "del \"{0}\"\n" +
                        "if exist \"{0}\" goto loop\n" +
                        "timeout /t 1 /nobreak >nul\n" +
                        "rmdir /s /q \"{1}\"\n" +
                        "del \"%~f0\"",
                        exePath,
                        installDir
                    );

                    File.WriteAllText(tempBatch, batchContent);

                    ProcessStartInfo psi = new ProcessStartInfo()
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c \"" + tempBatch + "\"",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);

                    Application.Exit();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "アンインストール中にエラーが発生しました:\n" + ex.Message,
                        "エラー",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
            }
        }
    }
}
