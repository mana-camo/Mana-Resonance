using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;
using System.Reflection;
using System.Security.Principal;
using Microsoft.Win32;
using System.Threading.Tasks;

namespace ManaResonanceUninstall
{
    public class UninstallerForm : Form
    {
        private Panel bannerPanel;
        private Label lblBannerTitle;
        private Label lblBannerSub;
        private PictureBox bannerIcon;
        private Panel bannerBorder;
        private Panel bottomBorder;

        // 確認画面
        private Panel confirmPanel;
        private Label lblConfirmTitle;
        private Label lblConfirmDesc;

        // アンインストール進行画面 (緑色プログレスバー)
        private Panel progressPanel;
        private Label lblProgressDesc;
        private ProgressBar progressBar;

        // 完了画面
        private Panel finishPanel;
        private Label lblFinishTitle;
        private Label lblFinishDesc;

        private Button btnAction;
        private Button btnCancel;

        private int currentStep = 0; // 0: Confirm, 1: Progress, 2: Finish
        private string language = "EN";
        private string installDir = "";

        public UninstallerForm()
        {
            string exePath = Process.GetCurrentProcess().MainModule.FileName;
            installDir = Path.GetDirectoryName(exePath);

            language = DetectLanguage();

            InitializeComponent();
            ApplyLanguage();
            ShowStep(0);
        }

        private string DetectLanguage()
        {
            try
            {
                // 1. AppData 内の config.json を探索 (ユーザー設定最優先)
                string appDataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "mana-resonance", "config.json");
                if (File.Exists(appDataPath))
                {
                    string json = File.ReadAllText(appDataPath);
                    if (json.IndexOf("\"language\": \"JA\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        json.IndexOf("\"language\":\"JA\"", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return "JA";
                    }
                    else if (json.IndexOf("\"language\": \"EN\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                             json.IndexOf("\"language\":\"EN\"", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return "EN";
                    }
                }
            }
            catch { }

            try
            {
                // 2. language.txt の探索
                string langFilePath = Path.Combine(installDir, "language.txt");
                if (File.Exists(langFilePath))
                {
                    string content = File.ReadAllText(langFilePath).Trim().ToUpper();
                    if (content == "JA" || content == "EN") return content;
                }
            }
            catch { }

            return "EN";
        }

        private void InitializeComponent()
        {
            this.bannerPanel = new Panel();
            this.lblBannerTitle = new Label();
            this.lblBannerSub = new Label();
            this.bannerIcon = new PictureBox();
            this.bannerBorder = new Panel();
            this.bottomBorder = new Panel();

            this.confirmPanel = new Panel();
            this.lblConfirmTitle = new Label();
            this.lblConfirmDesc = new Label();

            this.progressPanel = new Panel();
            this.lblProgressDesc = new Label();
            this.progressBar = new ProgressBar();

            this.finishPanel = new Panel();
            this.lblFinishTitle = new Label();
            this.lblFinishDesc = new Label();

            this.btnAction = new Button();
            this.btnCancel = new Button();

            this.SuspendLayout();

            this.Text = "Mana Resonance Uninstaller";
            this.ClientSize = new Size(520, 320);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(12, 14, 22);

            try
            {
                Icon appIcon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                if (appIcon != null) this.Icon = appIcon;
            }
            catch { }

            // 上部バナー
            bannerPanel.Size = new Size(520, 60);
            bannerPanel.Location = new Point(0, 0);
            bannerPanel.BackColor = Color.FromArgb(18, 22, 34);

            lblBannerTitle.Location = new Point(15, 10);
            lblBannerTitle.Size = new Size(420, 22);
            lblBannerTitle.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
            lblBannerTitle.ForeColor = Color.White;

            lblBannerSub.Location = new Point(18, 33);
            lblBannerSub.Size = new Size(420, 20);
            lblBannerSub.Font = new Font("Segoe UI", 8.5f);
            lblBannerSub.ForeColor = Color.FromArgb(160, 170, 190);

            bannerIcon.Size = new Size(38, 38);
            bannerIcon.Location = new Point(468, 10);
            bannerIcon.SizeMode = PictureBoxSizeMode.Zoom;
            try
            {
                Icon appIcon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                if (appIcon != null) bannerIcon.Image = appIcon.ToBitmap();
            }
            catch { }

            bannerBorder.Size = new Size(520, 1);
            bannerBorder.Location = new Point(0, 60);
            bannerBorder.BackColor = Color.FromArgb(40, 45, 65);

            bannerPanel.Controls.Add(lblBannerTitle);
            bannerPanel.Controls.Add(lblBannerSub);
            bannerPanel.Controls.Add(bannerIcon);
            this.Controls.Add(bannerPanel);
            this.Controls.Add(bannerBorder);

            // 1. 確認画面
            confirmPanel.Size = new Size(520, 200);
            confirmPanel.Location = new Point(0, 61);

            lblConfirmTitle.Location = new Point(25, 25);
            lblConfirmTitle.Size = new Size(470, 30);
            lblConfirmTitle.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            lblConfirmTitle.ForeColor = Color.FromArgb(244, 63, 94);

            lblConfirmDesc.Location = new Point(25, 65);
            lblConfirmDesc.Size = new Size(470, 100);
            lblConfirmDesc.Font = new Font("Segoe UI", 9.5f);
            lblConfirmDesc.ForeColor = Color.FromArgb(200, 210, 225);

            confirmPanel.Controls.Add(lblConfirmTitle);
            confirmPanel.Controls.Add(lblConfirmDesc);
            this.Controls.Add(confirmPanel);

            // 2. アンインストール進行画面 (緑色プログレスバー)
            progressPanel.Size = new Size(520, 200);
            progressPanel.Location = new Point(0, 61);
            progressPanel.Visible = false;

            lblProgressDesc.Location = new Point(25, 45);
            lblProgressDesc.Size = new Size(470, 30);
            lblProgressDesc.Font = new Font("Segoe UI", 9.5f);
            lblProgressDesc.ForeColor = Color.FromArgb(200, 210, 225);

            progressBar.Location = new Point(25, 90);
            progressBar.Size = new Size(470, 26);
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.ForeColor = Color.FromArgb(34, 197, 94);

            progressPanel.Controls.Add(lblProgressDesc);
            progressPanel.Controls.Add(progressBar);
            this.Controls.Add(progressPanel);

            // 3. 完了画面
            finishPanel.Size = new Size(520, 200);
            finishPanel.Location = new Point(0, 61);
            finishPanel.Visible = false;

            lblFinishTitle.Location = new Point(25, 30);
            lblFinishTitle.Size = new Size(470, 30);
            lblFinishTitle.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            lblFinishTitle.ForeColor = Color.FromArgb(74, 222, 128);

            lblFinishDesc.Location = new Point(25, 75);
            lblFinishDesc.Size = new Size(470, 90);
            lblFinishDesc.Font = new Font("Segoe UI", 9.5f);
            lblFinishDesc.ForeColor = Color.FromArgb(200, 210, 225);

            finishPanel.Controls.Add(lblFinishTitle);
            finishPanel.Controls.Add(lblFinishDesc);
            this.Controls.Add(finishPanel);

            // 下部ナビゲーション
            bottomBorder.Size = new Size(520, 1);
            bottomBorder.Location = new Point(0, 269);
            bottomBorder.BackColor = Color.FromArgb(40, 45, 65);
            this.Controls.Add(bottomBorder);

            btnAction.Location = new Point(310, 280);
            btnAction.Size = new Size(95, 28);
            btnAction.FlatStyle = FlatStyle.System;
            btnAction.Click += BtnAction_Click;

            btnCancel.Location = new Point(412, 280);
            btnCancel.Size = new Size(95, 28);
            btnCancel.FlatStyle = FlatStyle.System;
            btnCancel.Click += (s, e) => this.Close();

            this.Controls.Add(btnAction);
            this.Controls.Add(btnCancel);

            this.ResumeLayout(false);
        }

        private void ApplyLanguage()
        {
            if (language == "JA")
            {
                lblBannerTitle.Text = "Mana Resonance アンインストーラー";
                lblBannerSub.Text = "アプリケーションの削除";
                lblConfirmTitle.Text = "Mana Resonance をアンインストールしますか？";
                lblConfirmDesc.Text = "この操作により、コンピューターから Mana Resonance およびそのすべての関連構成ファイルが削除されます。\r\n\r\n続行するには「アンインストール」をクリックしてください。";
                lblProgressDesc.Text = "関連ファイルおよび設定を削除しています。しばらくお待ちください...";
                lblFinishTitle.Text = "アンインストールが完了しました";
                lblFinishDesc.Text = "Mana Resonance はコンピューターから正常に削除されました。";
                btnAction.Text = "アンインストール";
                btnCancel.Text = "キャンセル";
            }
            else
            {
                lblBannerTitle.Text = "Mana Resonance Uninstaller";
                lblBannerSub.Text = "Remove application components";
                lblConfirmTitle.Text = "Uninstall Mana Resonance?";
                lblConfirmDesc.Text = "This will completely remove Mana Resonance and all of its components from your computer.\r\n\r\nClick Uninstall to proceed.";
                lblProgressDesc.Text = "Removing application files and registry keys. Please wait...";
                lblFinishTitle.Text = "Uninstallation Completed";
                lblFinishDesc.Text = "Mana Resonance has been successfully uninstalled from your system.";
                btnAction.Text = "Uninstall";
                btnCancel.Text = "Cancel";
            }
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            confirmPanel.Visible = (step == 0);
            progressPanel.Visible = (step == 1);
            finishPanel.Visible = (step == 2);

            btnCancel.Enabled = (step != 1);

            if (step == 0)
            {
                btnAction.Text = language == "JA" ? "アンインストール" : "Uninstall";
                btnAction.Enabled = true;
            }
            else if (step == 1)
            {
                btnAction.Enabled = false;
            }
            else if (step == 2)
            {
                btnAction.Text = language == "JA" ? "完了" : "Finish";
                btnAction.Enabled = true;
            }
        }

        // ★ アプリが起動中であるかを検出 ★
        private bool IsAppRunning()
        {
            Process[] processes = Process.GetProcessesByName("Mana Resonance");
            if (processes != null && processes.Length > 0) return true;

            Process[] electronProcesses = Process.GetProcessesByName("electron");
            if (electronProcesses != null && electronProcesses.Length > 0) return true;

            return false;
        }

        private async void BtnAction_Click(object sender, EventArgs e)
        {
            if (currentStep == 0)
            {
                // ★ 実行中制限: アプリが起動している場合はブロックメッセージを出して進行を遮断 ★
                if (IsAppRunning())
                {
                    string msg = language == "JA"
                        ? "Mana Resonance が現在実行中です。\nアンインストールを続行するには、アプリを終了してください。"
                        : "Mana Resonance is currently running.\nPlease close the application before proceeding with uninstallation.";
                    string title = language == "JA" ? "実行中エラー" : "Application Running";
                    MessageBox.Show(msg, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                ShowStep(1);
                await PerformUninstallation();
            }
            else if (currentStep == 2)
            {
                CleanupSelfAndExit();
            }
        }

        private async Task PerformUninstallation()
        {
            try
            {
                progressBar.Value = 15;
                await Task.Delay(350);

                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLink = Path.Combine(desktopPath, "Mana Resonance.lnk");
                if (File.Exists(desktopLink)) try { File.Delete(desktopLink); } catch { }

                string commonStartMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs");
                string startMenuLink = Path.Combine(commonStartMenu, "Mana Resonance.lnk");
                if (File.Exists(startMenuLink)) try { File.Delete(startMenuLink); } catch { }

                progressBar.Value = 45;
                await Task.Delay(400);

                try
                {
                    using (RegistryKey uninstallKey = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (uninstallKey != null) uninstallKey.DeleteSubKeyTree("ManaResonance", false);
                    }
                }
                catch { }

                progressBar.Value = 75;
                await Task.Delay(400);

                progressBar.Value = 95;
                await Task.Delay(300);

                progressBar.Value = 100;
                await Task.Delay(300);

                ShowStep(2);
            }
            catch (Exception ex)
            {
                MessageBox.Show((language == "JA" ? "アンインストール中にエラーが発生しました:\n" : "Uninstallation error:\n") + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                this.Close();
            }
        }

        private void CleanupSelfAndExit()
        {
            try
            {
                string tempBatch = Path.Combine(Path.GetTempPath(), "mana_resonance_cleanup.bat");
                string script = string.Format(
                    "@echo off\r\n" +
                    "timeout /t 1 /nobreak > NUL\r\n" +
                    "rmdir /s /q \"{0}\"\r\n" +
                    "del \"%~f0\"\r\n",
                    installDir
                );
                File.WriteAllText(tempBatch, script);

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = tempBatch;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch { }

            this.Close();
        }

        [STAThread]
        public static void Main()
        {
            bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (!isAdmin)
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Application.ExecutablePath;
                psi.Verb = "runas";
                try
                {
                    Process.Start(psi);
                    Application.Exit();
                    return;
                }
                catch
                {
                    Application.Exit();
                    return;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UninstallerForm());
        }
    }
}
