using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;
using System.Reflection;
using System.Security.Principal;
using Microsoft.Win32;
using System.IO.Compression;
using System.Net;

namespace ManaResonanceInstall
{
    public class InstallerForm : Form
    {
        private Panel bannerPanel;
        private Label lblBannerTitle;
        private Label lblBannerSub;
        private PictureBox bannerIcon;

        private Panel welcomePanel;
        private Label lblWelcomeTitle;
        private Label lblWelcomeDesc;

        private Panel folderPanel;
        private Label lblFolderDesc;
        private TextBox txtFolder;
        private Button btnBrowse;

        private Panel progressPanel;
        private Label lblProgressDesc;
        private ProgressBar progressBar;

        private Panel finishPanel;
        private Label lblFinishTitle;
        private CheckBox chkRunApp;

        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;

        private int currentStep = 0; // 0: Welcome, 1: Folder, 2: Progress, 3: Finish
        private string defaultInstallPath;

        private bool isUpdateMode = false;
        private string updateDownloadUrl = "";

        public InstallerForm(bool isUpdate = false, string downloadUrl = "")
        {
            this.isUpdateMode = isUpdate;
            this.updateDownloadUrl = downloadUrl;

            // デフォルトインストール先 (Program Files)
            defaultInstallPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mana Resonance");
            InitializeComponent();
            
            if (isUpdateMode)
            {
                // アップデートモード時はダイレクトに進捗画面(ステップ2)へ行き、ダウンロードを開始
                ShowStep(2);
                StartUpdateDownload();
            }
            else
            {
                ShowStep(0);
            }
        }

        private void InitializeComponent()
        {
            this.bannerPanel = new Panel();
            this.lblBannerTitle = new Label();
            this.lblBannerSub = new Label();
            this.bannerIcon = new PictureBox();

            this.welcomePanel = new Panel();
            this.lblWelcomeTitle = new Label();
            this.lblWelcomeDesc = new Label();

            this.folderPanel = new Panel();
            this.lblFolderDesc = new Label();
            this.txtFolder = new TextBox();
            this.btnBrowse = new Button();

            this.progressPanel = new Panel();
            this.lblProgressDesc = new Label();
            this.progressBar = new ProgressBar();

            this.finishPanel = new Panel();
            this.lblFinishTitle = new Label();
            this.chkRunApp = new CheckBox();

            this.btnBack = new Button();
            this.btnNext = new Button();
            this.btnCancel = new Button();

            this.SuspendLayout();

            // 
            // Window Settings (一般的なWindowsインストーラーサイズとUI)
            // 
            this.ClientSize = new Size(520, 360);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Text = "Mana Resonance セットアップ";

            // 
            // bannerPanel (上部バナー領域 - 一般的な流通ソフトのUI)
            // 
            this.bannerPanel.BackColor = Color.White;
            this.bannerPanel.Dock = DockStyle.Top;
            this.bannerPanel.Height = 65;
            this.bannerPanel.BorderStyle = BorderStyle.FixedSingle;
            this.bannerPanel.Controls.Add(this.lblBannerTitle);
            this.bannerPanel.Controls.Add(this.lblBannerSub);
            this.bannerPanel.Controls.Add(this.bannerIcon);

            this.lblBannerTitle.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            this.lblBannerTitle.Location = new Point(15, 10);
            this.lblBannerTitle.Size = new Size(300, 20);
            this.lblBannerTitle.Text = "Mana Resonance セットアップウィザード";

            this.lblBannerSub.Font = new Font("Segoe UI", 8.5F);
            this.lblBannerSub.Location = new Point(25, 32);
            this.lblBannerSub.Size = new Size(400, 18);
            this.lblBannerSub.Text = "PCに Mana Resonance をインストールします。";

            // 
            // welcomePanel (ステップ 0: ようこそ画面)
            // 
            this.welcomePanel.Location = new Point(0, 65);
            this.welcomePanel.Size = new Size(520, 240);
            this.welcomePanel.BackColor = SystemColors.Control;

            this.lblWelcomeTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            this.lblWelcomeTitle.Location = new Point(25, 25);
            this.lblWelcomeTitle.Size = new Size(470, 25);
            this.lblWelcomeTitle.Text = "Mana Resonance セットアップへようこそ";

            this.lblWelcomeDesc.Font = new Font("Segoe UI", 9F);
            this.lblWelcomeDesc.Location = new Point(27, 65);
            this.lblWelcomeDesc.Size = new Size(460, 150);
            this.lblWelcomeDesc.Text = "このセットアップウィザードは、Mana Resonance をお使いのコンピューターにインストールします。\n\n続行するには「次へ」をクリックしてください。";
            this.welcomePanel.Controls.Add(this.lblWelcomeTitle);
            this.welcomePanel.Controls.Add(this.lblWelcomeDesc);

            // 
            // folderPanel (ステップ 1: インストール先フォルダ選択)
            // 
            this.folderPanel.Location = new Point(0, 65);
            this.folderPanel.Size = new Size(520, 240);
            this.folderPanel.BackColor = SystemColors.Control;

            this.lblFolderDesc.Font = new Font("Segoe UI", 9F);
            this.lblFolderDesc.Location = new Point(25, 25);
            this.lblFolderDesc.Size = new Size(470, 40);
            this.lblFolderDesc.Text = "インストール先のフォルダを選択してください。\n別のフォルダにインストールする場合は、「参照」をクリックして選択してください。";

            this.txtFolder.Font = new Font("Segoe UI", 9F);
            this.txtFolder.Location = new Point(25, 80);
            this.txtFolder.Size = new Size(365, 23);
            this.txtFolder.Text = defaultInstallPath;

            this.btnBrowse.Font = new Font("Segoe UI", 9F);
            this.btnBrowse.Location = new Point(400, 78);
            this.btnBrowse.Size = new Size(90, 26);
            this.btnBrowse.Text = "参照(&B)...";
            this.btnBrowse.Click += new EventHandler(this.btnBrowse_Click);
            this.folderPanel.Controls.Add(this.lblFolderDesc);
            this.folderPanel.Controls.Add(this.txtFolder);
            this.folderPanel.Controls.Add(this.btnBrowse);

            // 
            // progressPanel (ステップ 2: インストール進捗状況)
            // 
            this.progressPanel.Location = new Point(0, 65);
            this.progressPanel.Size = new Size(520, 240);
            this.progressPanel.BackColor = SystemColors.Control;

            this.lblProgressDesc.Font = new Font("Segoe UI", 9F);
            this.lblProgressDesc.Location = new Point(25, 35);
            this.lblProgressDesc.Size = new Size(470, 30);
            this.lblProgressDesc.Text = "ファイルを展開し、セットアップを実行しています。しばらくお待ちください...";

            this.progressBar.Location = new Point(25, 80);
            this.progressBar.Size = new Size(465, 20);
            this.progressBar.Style = ProgressBarStyle.Blocks;
            this.progressPanel.Controls.Add(this.lblProgressDesc);
            this.progressPanel.Controls.Add(this.progressBar);

            // 
            // finishPanel (ステップ 3: 完了画面)
            // 
            this.finishPanel.Location = new Point(0, 65);
            this.finishPanel.Size = new Size(520, 240);
            this.finishPanel.BackColor = SystemColors.Control;

            this.lblFinishTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            this.lblFinishTitle.Location = new Point(25, 25);
            this.lblFinishTitle.Size = new Size(470, 25);
            this.lblFinishTitle.Text = "Mana Resonance セットアップの完了";

            this.chkRunApp.Font = new Font("Segoe UI", 9F);
            this.chkRunApp.Location = new Point(27, 80);
            this.chkRunApp.Size = new Size(400, 24);
            this.chkRunApp.Text = "インストール完了後に Mana Resonance を起動する";
            this.chkRunApp.Checked = true;
            this.finishPanel.Controls.Add(this.lblFinishTitle);
            this.finishPanel.Controls.Add(this.chkRunApp);

            // 
            // Control Buttons (戻る、次へ、キャンセル)
            // 
            this.btnBack.Font = new Font("Segoe UI", 9F);
            this.btnBack.Location = new Point(220, 318);
            this.btnBack.Size = new Size(85, 26);
            this.btnBack.Text = "< 戻る(&B)";
            this.btnBack.Click += new EventHandler(this.btnBack_Click);

            this.btnNext.Font = new Font("Segoe UI", 9F);
            this.btnNext.Location = new Point(310, 318);
            this.btnNext.Size = new Size(85, 26);
            this.btnNext.Text = "次へ(&N) >";
            this.btnNext.Click += new EventHandler(this.btnNext_Click);

            this.btnCancel.Font = new Font("Segoe UI", 9F);
            this.btnCancel.Location = new Point(410, 318);
            this.btnCancel.Size = new Size(85, 26);
            this.btnCancel.Text = "キャンセル";
            this.btnCancel.Click += new EventHandler(this.btnCancel_Click);

            // 
            // Add to Form
            // 
            this.Controls.Add(this.bannerPanel);
            this.Controls.Add(this.welcomePanel);
            this.Controls.Add(this.folderPanel);
            this.Controls.Add(this.progressPanel);
            this.Controls.Add(this.finishPanel);
            this.Controls.Add(this.btnBack);
            this.Controls.Add(this.btnNext);
            this.Controls.Add(this.btnCancel);

            this.welcomePanel.SuspendLayout();
            this.folderPanel.SuspendLayout();
            this.progressPanel.SuspendLayout();
            this.finishPanel.SuspendLayout();
            this.bannerPanel.ResumeLayout(false);
            this.ResumeLayout(false);
        }

        private void ShowStep(int step)
        {
            currentStep = step;

            welcomePanel.Visible = (step == 0);
            folderPanel.Visible = (step == 1);
            progressPanel.Visible = (step == 2);
            finishPanel.Visible = (step == 3);

            btnBack.Enabled = (step > 0 && step < 2); // 進行中と完了画面では戻れない
            btnCancel.Enabled = (step < 2); // 進行中・完了後はキャンセル不可

            if (step == 0)
            {
                lblBannerSub.Text = "PCに Mana Resonance をインストールします。";
                btnNext.Text = "次へ(&N) >";
            }
            else if (step == 1)
            {
                lblBannerSub.Text = "インストール先のフォルダを選択します。";
                btnNext.Text = "次へ(&N) >";
            }
            else if (step == 2)
            {
                lblBannerSub.Text = "必要なファイルをコピーしています。";
                btnNext.Text = "次へ(&N) >";
                btnNext.Enabled = false;
                ExecuteInstallation();
            }
            else if (step == 3)
            {
                lblBannerSub.Text = "セットアップが正常に終了しました。";
                btnNext.Text = "完了(&F)";
                btnNext.Enabled = true;
            }
        }

        private void btnBack_Click(object sender, EventArgs e)
        {
            if (currentStep > 0)
            {
                ShowStep(currentStep - 1);
            }
        }

        private void btnNext_Click(object sender, EventArgs e)
        {
            if (currentStep == 3)
            {
                // 完了時処理
                if (chkRunApp.Checked)
                {
                    string targetFolder = txtFolder.Text.Trim();
                    string mainExe = Path.Combine(targetFolder, "Mana Resonance.exe");
                    if (File.Exists(mainExe))
                    {
                        Process.Start(new ProcessStartInfo()
                        {
                            FileName = mainExe,
                            WorkingDirectory = targetFolder
                        });
                    }
                }
                this.Close();
            }
            else if (currentStep < 3)
            {
                ShowStep(currentStep + 1);
            }
        }

        private void btnCancel_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void btnBrowse_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Mana Resonance のインストール先フォルダを選択してください。";
                fbd.SelectedPath = txtFolder.Text;
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    txtFolder.Text = fbd.SelectedPath;
                }
            }
        }

        private async void ExecuteInstallation()
        {
            string targetDir = txtFolder.Text.Trim();

            try
            {
                progressBar.Value = 10;
                await System.Threading.Tasks.Task.Delay(300);

                if (Directory.Exists(targetDir))
                {
                    try { Directory.Delete(targetDir, true); } catch { }
                }
                Directory.CreateDirectory(targetDir);
                progressBar.Value = 20;

                // 1. 埋め込まれた app.zip を一時フォルダへ展開する
                string zipPath = Path.Combine(Path.GetTempPath(), "mana_resonance_temp.zip");
                if (File.Exists(zipPath)) File.Delete(zipPath);

                ExtractResource("app.zip", zipPath);
                progressBar.Value = 40;

                // ZIP解凍
                await System.Threading.Tasks.Task.Run(() => {
                    ZipFile.ExtractToDirectory(zipPath, targetDir);
                });
                progressBar.Value = 75;
                File.Delete(zipPath);

                // 2. 埋め込まれた uninstaller.exe をインストール先に書き出す
                string uninstallerPath = Path.Combine(targetDir, "uninstaller.exe");
                ExtractResource("uninstaller.exe", uninstallerPath);
                progressBar.Value = 85;

                // 3. ショートカットの作成
                string mainExePath = Path.Combine(targetDir, "Mana Resonance.exe");

                // デスクトップ
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktopPath, "Mana Resonance.lnk"), mainExePath, targetDir);

                // スタートメニュー (All Users / Common StartMenu に登録したいため、管理者権限が必要です)
                string commonStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs");
                if (!Directory.Exists(commonStartMenu))
                {
                    commonStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                }
                CreateShortcut(Path.Combine(commonStartMenu, "Mana Resonance.lnk"), mainExePath, targetDir);
                progressBar.Value = 95;

                // 4. レジストリ (Uninstall情報) の登録
                RegisterUninstall(targetDir, uninstallerPath, mainExePath);

                // 5. 自分自身を updater.exe としてインストール先にコピー (自動アップデート時に使用するため)
                try
                {
                    string updaterPath = Path.Combine(targetDir, "updater.exe");
                    File.Copy(Application.ExecutablePath, updaterPath, true);
                }
                catch {}

                progressBar.Value = 100;

                await System.Threading.Tasks.Task.Delay(500);
                ShowStep(3); // 完了画面へ
            }
            catch (Exception ex)
            {
                MessageBox.Show("インストール中にエラーが発生しました:\n" + ex.Message, "エラー", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowStep(1); // フォルダ選択画面へ戻す
                btnNext.Enabled = true;
            }
        }

        private void ExtractResource(string resourceName, string destPath)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            string fullResourceName = null;

            // リソース名がエイリアス指定によって正確に resourceName になっているものを最優先で取得
            foreach (string name in assembly.GetManifestResourceNames())
            {
                if (name.Equals(resourceName, StringComparison.OrdinalIgnoreCase) || name.EndsWith("." + resourceName, StringComparison.OrdinalIgnoreCase))
                {
                    fullResourceName = name;
                    break;
                }
            }

            // 見つからない場合は EndsWith 部分一致で再度検索
            if (fullResourceName == null)
            {
                foreach (string name in assembly.GetManifestResourceNames())
                {
                    if (name.EndsWith(resourceName, StringComparison.OrdinalIgnoreCase))
                    {
                        fullResourceName = name;
                        break;
                    }
                }
            }

            if (fullResourceName == null)
            {
                throw new Exception("リソース '" + resourceName + "' がセットアップファイル内に見つかりません。");
            }

            using (Stream stream = assembly.GetManifestResourceStream(fullResourceName))
            using (FileStream fs = new FileStream(destPath, FileMode.Create, FileAccess.Write))
            {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    fs.Write(buffer, 0, bytesRead);
                }
            }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                var shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                // アイコンを指定
                shortcut.IconLocation = targetPath + ",0";
                shortcut.Save();
            }
            catch (Exception ex)
            {
                Console.WriteLine("ショートカット作成失敗: " + ex.Message);
            }
        }

        private void RegisterUninstall(string installDir, string uninstallerPath, string iconPath)
        {
            // 管理者として実行されているため、全ユーザー (LocalMachine) の Uninstall レジストリに登録します
            using (RegistryKey parent = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
            {
                if (parent == null) return;
                using (RegistryKey key = parent.CreateSubKey("ManaResonance"))
                {
                    key.SetValue("DisplayName", "Mana Resonance");
                    key.SetValue("ApplicationVersion", "1.0.5");
                    key.SetValue("Publisher", "Mana Resonance Studio");
                    key.SetValue("DisplayIcon", iconPath);
                    key.SetValue("DisplayVersion", "1.0.5");
                    key.SetValue("InstallLocation", installDir);
                    key.SetValue("UninstallString", uninstallerPath);
                    key.SetValue("NoModify", 1);
                    key.SetValue("NoRepair", 1);
                }
            }
        }

        private void StartUpdateDownload()
        {
            // ボタン操作を無効・非表示に
            btnBack.Visible = false;
            btnNext.Visible = false;
            btnCancel.Enabled = false;

            lblBannerTitle.Text = "Updating Mana Resonance";
            lblBannerSub.Text = "Downloading and applying latest updates...";

            string tempZipPath = Path.Combine(Path.GetTempPath(), "mana_update_download.zip");
            if (File.Exists(tempZipPath))
            {
                try { File.Delete(tempZipPath); } catch {}
            }

            try
            {
                using (WebClient client = new WebClient())
                {
                    // GitHub API/Download からダウンロードするため、User-Agent が必須
                    client.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ElectronUpdater");
                    
                    // TLS1.2/1.3 などのセキュリティプロトコル強制（GitHub等のSSL接続用）
                    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;

                    client.DownloadProgressChanged += (s, e) => {
                        // 進捗の 70% をダウンロードフェーズにあてる
                        progressBar.Value = (int)(e.ProgressPercentage * 0.7);
                        lblProgressDesc.Text = string.Format("Downloading latest update... {0}%", e.ProgressPercentage);
                    };

                    client.DownloadFileCompleted += async (s, e) => {
                        if (e.Error != null)
                        {
                            MessageBox.Show("Failed to download update:\n" + e.Error.Message, "Update Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            Application.Exit();
                            return;
                        }

                        // ダウンロード成功。上書き展開フェーズ（残り30%）
                        lblProgressDesc.Text = "Applying update files...";
                        progressBar.Value = 80;
                        
                        await ApplyUpdateFromZipAsync(tempZipPath);
                    };

                    client.DownloadFileAsync(new Uri(updateDownloadUrl), tempZipPath);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Update download failed:\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        }

        private async System.Threading.Tasks.Task ApplyUpdateFromZipAsync(string zipPath)
        {
            try
            {
                // 既存プロセスの強制終了 (書き換えブロック防止)
                Process[] processes = Process.GetProcessesByName("Mana Resonance");
                foreach (var process in processes)
                {
                    try { process.Kill(); process.WaitForExit(3000); } catch {}
                }

                progressBar.Value = 90;

                // ZIP上書き解凍
                string targetDir = defaultInstallPath;
                await System.Threading.Tasks.Task.Run(() => {
                    using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue;

                            string destPath = Path.Combine(targetDir, entry.FullName);
                            string destSubDir = Path.GetDirectoryName(destPath);

                            if (!Directory.Exists(destSubDir))
                            {
                                Directory.CreateDirectory(destSubDir);
                            }

                            entry.ExtractToFile(destPath, true);
                        }
                    }
                });

                progressBar.Value = 95;

                // 一時ファイルの削除
                try { File.Delete(zipPath); } catch {}

                progressBar.Value = 100;
                lblProgressDesc.Text = "Update completed successfully!";
                await System.Threading.Tasks.Task.Delay(500);

                // アプリの自動再起動
                string mainExe = Path.Combine(targetDir, "Mana Resonance.exe");
                if (File.Exists(mainExe))
                {
                    Process.Start(mainExe);
                }

                Application.Exit();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to apply update:\n" + ex.Message, "Update Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool isSilent = false;
            bool isUpdate = false;
            string downloadUrl = "";

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i].Equals("/silent", StringComparison.OrdinalIgnoreCase) || 
                    args[i].Equals("/verysilent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
                else if (args[i].Equals("/update", StringComparison.OrdinalIgnoreCase))
                {
                    isUpdate = true;
                    if (i + 1 < args.Length)
                    {
                        downloadUrl = args[i + 1];
                    }
                }
            }

            // 管理者権限（UAC）チェックと自動昇格再起動
            bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (!isAdmin)
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Application.ExecutablePath;
                
                string arguments = "";
                if (isSilent) arguments += "/silent ";
                if (isUpdate) arguments += "/update \"" + downloadUrl + "\"";
                
                psi.Arguments = arguments.Trim();
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

            if (isSilent)
            {
                // サイレントモード時はフォームを表示せずにバックグラウンドで上書き展開
                RunSilentInstall();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm(isUpdate, downloadUrl));
        }

        private static void RunSilentInstall()
        {
            try
            {
                string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mana Resonance");
                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                Assembly assembly = Assembly.GetExecutingAssembly();

                // 既存プロセスの強制終了 (書き換え時の競合ロックを防止するため、Mana Resonanceを事前に強制終了)
                Process[] processes = Process.GetProcessesByName("Mana Resonance");
                foreach (var process in processes)
                {
                    try { process.Kill(); process.WaitForExit(3000); } catch {}
                }

                // uninstaller.exe
                string uninstallerPath = Path.Combine(installDir, "uninstaller.exe");
                ExtractResourceDirect(assembly, "uninstaller.exe", uninstallerPath);

                // app.zip
                string tempZip = Path.Combine(Path.GetTempPath(), "mana_app_silent.zip");
                ExtractResourceDirect(assembly, "app.zip", tempZip);

                // ZIP展開 (上書き)
                if (File.Exists(tempZip))
                {
                    using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue; // フォルダエントリはスキップ

                            string destPath = Path.Combine(installDir, entry.FullName);
                            string destSubDir = Path.GetDirectoryName(destPath);

                            if (!Directory.Exists(destSubDir))
                            {
                                Directory.CreateDirectory(destSubDir);
                            }

                            // 既存のファイルを強制上書きコピー
                            entry.ExtractToFile(destPath, true);
                        }
                    }
                    try { File.Delete(tempZip); } catch {}
                }

                // ショートカット再作成
                string mainExe = Path.Combine(installDir, "Mana Resonance.exe");
                CreateShortcutsDirect(installDir, mainExe);

                // レジストリ登録
                RegisterUninstallDirect(installDir, uninstallerPath, mainExe);

                // 最新版を自動起動
                if (File.Exists(mainExe))
                {
                    Process.Start(mainExe);
                }
            }
            catch (Exception ex)
            {
                // サイレントモード時はエラーダイアログを表示しない
                Console.WriteLine("Silent install error: " + ex.Message);
            }
        }

        private static void ExtractResourceDirect(Assembly assembly, string resourceName, string destPath)
        {
            string fullResourceName = null;
            foreach (string name in assembly.GetManifestResourceNames())
            {
                if (name.EndsWith(resourceName, StringComparison.OrdinalIgnoreCase))
                {
                    fullResourceName = name;
                    break;
                }
            }

            if (fullResourceName == null) return;

            using (Stream stream = assembly.GetManifestResourceStream(fullResourceName))
            using (FileStream fs = new FileStream(destPath, FileMode.Create, FileAccess.Write))
            {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    fs.Write(buffer, 0, bytesRead);
                }
            }
        }

        private static void CreateShortcutsDirect(string installDir, string targetPath)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);

                // デスクトップ
                string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                var linkDesktop = shell.CreateShortcut(Path.Combine(desktopFolder, "Mana Resonance.lnk"));
                linkDesktop.TargetPath = targetPath;
                linkDesktop.WorkingDirectory = installDir;
                linkDesktop.IconLocation = targetPath + ",0";
                linkDesktop.Save();

                // スタートメニュー (All Users)
                string commonStartMenu = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu);
                string programsFolder = Path.Combine(commonStartMenu, "Programs");
                var linkStart = shell.CreateShortcut(Path.Combine(programsFolder, "Mana Resonance.lnk"));
                linkStart.TargetPath = targetPath;
                linkStart.WorkingDirectory = installDir;
                linkStart.IconLocation = targetPath + ",0";
                linkStart.Save();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Shortcut creation error: " + ex.Message);
            }
        }

        private static void RegisterUninstallDirect(string installDir, string uninstallerPath, string iconPath)
        {
            try
            {
                using (RegistryKey parent = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                {
                    if (parent == null) return;
                    using (RegistryKey key = parent.CreateSubKey("ManaResonance"))
                    {
                        key.SetValue("DisplayName", "Mana Resonance");
                        key.SetValue("ApplicationVersion", "1.0.5");
                        key.SetValue("Publisher", "Mana Resonance Studio");
                        key.SetValue("DisplayIcon", iconPath);
                        key.SetValue("DisplayVersion", "1.0.5");
                        key.SetValue("InstallLocation", installDir);
                        key.SetValue("UninstallString", uninstallerPath);
                        key.SetValue("NoModify", 1);
                        key.SetValue("NoRepair", 1);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Register uninstall error: " + ex.Message);
            }
        }
    }
}
