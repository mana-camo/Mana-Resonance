using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using System.IO.Compression;

class Launcher
{
    [STAThread]
    static void Main()
    {
        // テンポラリディレクトリのパスを作成
        string tempRoot = Path.GetTempPath();
        string appDirName = "ManaResonance_" + Guid.NewGuid().ToString("N");
        string extractPath = Path.Combine(tempRoot, appDirName);

        try
        {
            Directory.CreateDirectory(extractPath);

            // リソースから app.zip を取り出して書き出す
            string archivePath = Path.Combine(extractPath, "app.zip");
            Assembly assembly = Assembly.GetExecutingAssembly();
            
            string resourceName = "app.zip"; 
            
            // アセンブリの実際のリソース名を確認してマッチさせる
            string[] names = assembly.GetManifestResourceNames();
            foreach (var name in names)
            {
                if (name.EndsWith("app.zip"))
                {
                    resourceName = name;
                    break;
                }
            }

            using (Stream src = assembly.GetManifestResourceStream(resourceName))
            {
                if (src == null)
                {
                    throw new Exception("埋め込みリソース 'app.zip' が見つかりません。");
                }
                using (FileStream dest = new FileStream(archivePath, FileMode.Create))
                {
                    src.CopyTo(dest);
                }
            }

            // C#の標準機能でZIPを展開
            ZipFile.ExtractToDirectory(archivePath, extractPath);

            // 展開完了後、アーカイブファイルを削除
            File.Delete(archivePath);

            // アプリ本体の実行ファイルパス
            string exePath = Path.Combine(extractPath, "Mana Resonance.exe");
            if (!File.Exists(exePath))
            {
                throw new Exception("展開されたフォルダ内に Mana Resonance.exe が存在しません。");
            }

            // アプリケーションを起動
            ProcessStartInfo appInfo = new ProcessStartInfo();
            appInfo.FileName = exePath;
            appInfo.WorkingDirectory = extractPath;

            using (Process appProc = Process.Start(appInfo))
            {
                // アプリの終了を待機
                appProc.WaitForExit();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("Mana Resonance Desktopの起動中にエラーが発生しました:\n\n" + ex.Message, 
                            "Mana Resonance 起動エラー", 
                            MessageBoxButtons.OK, 
                            MessageBoxIcon.Error);
        }
        finally
        {
            // テンポラリディレクトリの削除
            for (int i = 0; i < 10; i++)
            {
                try
                {
                    if (Directory.Exists(extractPath))
                    {
                        Directory.Delete(extractPath, true);
                    }
                    break;
                }
                catch
                {
                    Thread.Sleep(800); // 0.8秒待機してリトライ
                }
            }
        }
    }
}
