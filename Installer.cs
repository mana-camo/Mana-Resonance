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
        private Panel bannerBorder;
        private Panel bottomBorder;

        // ウェルカム画面 (スプリット式)
        private Panel welcomePanel;
        private Panel leftWelcomePanel;
        private Panel rightWelcomePanel;
        private Label lblWelcomeTitle;
        private Label lblWelcomeDesc;

        // ライセンス規約画面 (新ステップ)
        private Panel licensePanel;
        private Label lblLicenseDesc;
        private TextBox txtLicense;
        private CheckBox chkAccept;

        // インストール先選択画面
        private Panel folderPanel;
        private Label lblFolderDesc;
        private TextBox txtFolder;
        private Button btnBrowse;

        // インストール進行中画面
        private Panel progressPanel;
        private Label lblProgressDesc;
        private ProgressBar progressBar;

        // 完了画面 (スプリット式)
        private Panel finishPanel;
        private Panel leftFinishPanel;
        private Panel rightFinishPanel;
        private Label lblFinishTitle;
        private Label lblFinishDesc;
        private CheckBox chkRunApp;
        private CheckBox chkShortcut;

        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;

        private int currentStep = 0; // 0: Welcome, 1: License, 2: Folder, 3: Progress, 4: Finish
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
                // アップデートモード時はダイレクトに進捗画面(ステップ3)へ行き、ダウンロードを開始
                ShowStep(3);
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
            this.bannerBorder = new Panel();
            this.bottomBorder = new Panel();

            // ウェルカム画面 (スプリット式)
            this.welcomePanel = new Panel();
            this.leftWelcomePanel = new Panel();
            this.rightWelcomePanel = new Panel();
            this.lblWelcomeTitle = new Label();
            this.lblWelcomeDesc = new Label();

            // ライセンス規約画面
            this.licensePanel = new Panel();
            this.lblLicenseDesc = new Label();
            this.txtLicense = new TextBox();
            this.chkAccept = new CheckBox();

            // インストール先フォルダ
            this.folderPanel = new Panel();
            this.lblFolderDesc = new Label();
            this.txtFolder = new TextBox();
            this.btnBrowse = new Button();

            // 進捗画面
            this.progressPanel = new Panel();
            this.lblProgressDesc = new Label();
            this.progressBar = new ProgressBar();

            // 完了画面 (スプリット式)
            this.finishPanel = new Panel();
            this.leftFinishPanel = new Panel();
            this.rightFinishPanel = new Panel();
            this.lblFinishTitle = new Label();
            this.lblFinishDesc = new Label();
            this.chkRunApp = new CheckBox();
            this.chkShortcut = new CheckBox();

            this.btnBack = new Button();
            this.btnNext = new Button();
            this.btnCancel = new Button();

            this.SuspendLayout();

            // 
            // Window Settings
            // 
            this.ClientSize = new Size(500, 360);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Text = "Mana Resonance Setup";

            // 境界線コントロール
            this.bannerBorder.BackColor = Color.FromArgb(220, 220, 220);
            this.bannerBorder.Location = new Point(0, 59);
            this.bannerBorder.Size = new Size(500, 1);

            this.bottomBorder.BackColor = Color.FromArgb(220, 220, 220);
            this.bottomBorder.Location = new Point(0, 312);
            this.bottomBorder.Size = new Size(500, 1);

            // 
            // bannerPanel (上部バナー領域 - License, Folder, Progressで共通使用)
            // 
            this.bannerPanel.BackColor = Color.White;
            this.bannerPanel.Location = new Point(0, 0);
            this.bannerPanel.Size = new Size(500, 59);
            this.bannerPanel.Controls.Add(this.lblBannerTitle);
            this.bannerPanel.Controls.Add(this.lblBannerSub);
            this.bannerPanel.Controls.Add(this.bannerIcon);
            this.bannerPanel.Controls.Add(this.bannerBorder);

            this.lblBannerTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            this.lblBannerTitle.Location = new Point(15, 10);
            this.lblBannerTitle.Size = new Size(350, 18);
            this.lblBannerTitle.Text = "Setup - Mana Resonance";

            this.lblBannerSub.Font = new Font("Segoe UI", 8.5F);
            this.lblBannerSub.Location = new Point(25, 28);
            this.lblBannerSub.Size = new Size(350, 18);
            this.lblBannerSub.Text = "Please review the options below.";

            this.bannerIcon.Size = new Size(38, 38);
            this.bannerIcon.Location = new Point(445, 10);
            this.bannerIcon.SizeMode = PictureBoxSizeMode.Zoom;
            try
            {
                if (File.Exists("icon.ico"))
                {
                    this.bannerIcon.Image = Icon.ExtractAssociatedIcon("icon.ico").ToBitmap();
                }
            }
            catch {}

            // 
            // welcomePanel (ステップ 0: ようこそ画面 - スプリット)
            // 
            this.welcomePanel.Location = new Point(0, 0);
            this.welcomePanel.Size = new Size(500, 312);
            this.welcomePanel.BackColor = Color.White;

            this.leftWelcomePanel.BackColor = Color.FromArgb(12, 36, 97);
            this.leftWelcomePanel.Location = new Point(0, 0);
            this.leftWelcomePanel.Size = new Size(160, 312);
            this.leftWelcomePanel.Paint += new PaintEventHandler(this.DrawSidebarWelcome);

            this.rightWelcomePanel.Location = new Point(170, 0);
            this.rightWelcomePanel.Size = new Size(330, 312);
            this.rightWelcomePanel.BackColor = Color.White;

            this.lblWelcomeTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            this.lblWelcomeTitle.Location = new Point(10, 25);
            this.lblWelcomeTitle.Size = new Size(310, 50);
            this.lblWelcomeTitle.Text = "Welcome to the Mana Resonance Setup Wizard";

            this.lblWelcomeDesc.Font = new Font("Segoe UI", 8.5F);
            this.lblWelcomeDesc.Location = new Point(10, 90);
            this.lblWelcomeDesc.Size = new Size(310, 200);
            this.lblWelcomeDesc.Text = "This wizard will guide you through the installation of Mana Resonance on your computer.\n\nIt is recommended that you close all other applications before starting Setup.\n\nClick Next to continue.";

            this.rightWelcomePanel.Controls.Add(this.lblWelcomeTitle);
            this.rightWelcomePanel.Controls.Add(this.lblWelcomeDesc);
            this.welcomePanel.Controls.Add(this.leftWelcomePanel);
            this.welcomePanel.Controls.Add(this.rightWelcomePanel);

            // 
            // licensePanel (ステップ 1: ライセンス規約)
            // 
            this.licensePanel.Location = new Point(0, 60);
            this.licensePanel.Size = new Size(500, 252);
            this.licensePanel.BackColor = SystemColors.Control;

            this.lblLicenseDesc.Font = new Font("Segoe UI", 8.5F);
            this.lblLicenseDesc.Location = new Point(15, 10);
            this.lblLicenseDesc.Size = new Size(470, 32);
            this.lblLicenseDesc.Text = "Please review the license terms before installing. Press Page Down to see the rest of the agreement.";

            this.txtLicense.Font = new Font("Consolas", 8.5F);
            this.txtLicense.Location = new Point(15, 45);
            this.txtLicense.Size = new Size(470, 160);
            this.txtLicense.Multiline = true;
            this.txtLicense.ReadOnly = true;
            this.txtLicense.ScrollBars = ScrollBars.Vertical;
            this.txtLicense.BackColor = Color.White;
            this.txtLicense.Text = GetLicenseText();

            this.chkAccept.Font = new Font("Segoe UI", 8.5F);
            this.chkAccept.Location = new Point(15, 215);
            this.chkAccept.Size = new Size(470, 24);
            this.chkAccept.Text = "I accept the terms in the License Agreement";
            this.chkAccept.CheckedChanged += new EventHandler(this.chkAccept_CheckedChanged);

            this.licensePanel.Controls.Add(this.lblLicenseDesc);
            this.licensePanel.Controls.Add(this.txtLicense);
            this.licensePanel.Controls.Add(this.chkAccept);

            // 
            // folderPanel (ステップ 2: インストール先選択)
            // 
            this.folderPanel.Location = new Point(0, 60);
            this.folderPanel.Size = new Size(500, 252);
            this.folderPanel.BackColor = SystemColors.Control;

            this.lblFolderDesc.Font = new Font("Segoe UI", 8.5F);
            this.lblFolderDesc.Location = new Point(15, 15);
            this.lblFolderDesc.Size = new Size(470, 40);
            this.lblFolderDesc.Text = "Setup will install Mana Resonance in the following folder. To install in a different folder, click Browse and select another folder. Click Next to continue.";

            this.txtFolder.Font = new Font("Segoe UI", 9F);
            this.txtFolder.Location = new Point(15, 80);
            this.txtFolder.Size = new Size(375, 23);
            this.txtFolder.Text = defaultInstallPath;

            this.btnBrowse.Font = new Font("Segoe UI", 8.5F);
            this.btnBrowse.Location = new Point(400, 78);
            this.btnBrowse.Size = new Size(85, 26);
            this.btnBrowse.Text = "Browse...";
            this.btnBrowse.Click += new EventHandler(this.btnBrowse_Click);

            this.folderPanel.Controls.Add(this.lblFolderDesc);
            this.folderPanel.Controls.Add(this.txtFolder);
            this.folderPanel.Controls.Add(this.btnBrowse);

            // 
            // progressPanel (ステップ 3: インストール進行中)
            // 
            this.progressPanel.Location = new Point(0, 60);
            this.progressPanel.Size = new Size(500, 252);
            this.progressPanel.BackColor = SystemColors.Control;

            this.lblProgressDesc.Font = new Font("Segoe UI", 8.5F);
            this.lblProgressDesc.Location = new Point(15, 30);
            this.lblProgressDesc.Size = new Size(470, 30);
            this.lblProgressDesc.Text = "Extracting files and performing installation. Please wait...";

            this.progressBar.Location = new Point(15, 75);
            this.progressBar.Size = new Size(470, 20);
            this.progressBar.Style = ProgressBarStyle.Blocks;
            this.progressPanel.Controls.Add(this.lblProgressDesc);
            this.progressPanel.Controls.Add(this.progressBar);

            // 
            // finishPanel (ステップ 4: 完了画面 - スプリット)
            // 
            this.finishPanel.Location = new Point(0, 0);
            this.finishPanel.Size = new Size(500, 312);
            this.finishPanel.BackColor = Color.White;

            this.leftFinishPanel.BackColor = Color.FromArgb(12, 36, 97);
            this.leftFinishPanel.Location = new Point(0, 0);
            this.leftFinishPanel.Size = new Size(160, 312);
            this.leftFinishPanel.Paint += new PaintEventHandler(this.DrawSidebarFinish);

            this.rightFinishPanel.Location = new Point(170, 0);
            this.rightFinishPanel.Size = new Size(330, 312);
            this.rightFinishPanel.BackColor = Color.White;

            this.lblFinishTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            this.lblFinishTitle.Location = new Point(10, 25);
            this.lblFinishTitle.Size = new Size(310, 50);
            this.lblFinishTitle.Text = "Completing the Mana Resonance Setup Wizard";

            this.lblFinishDesc.Font = new Font("Segoe UI", 8.5F);
            this.lblFinishDesc.Location = new Point(10, 90);
            this.lblFinishDesc.Size = new Size(310, 70);
            this.lblFinishDesc.Text = "Mana Resonance has been installed on your computer.\n\nClick Finish to close Setup.";

            this.chkRunApp.Font = new Font("Segoe UI", 8.5F);
            this.chkRunApp.Location = new Point(12, 175);
            this.chkRunApp.Size = new Size(300, 24);
            this.chkRunApp.Text = "Run Mana Resonance";
            this.chkRunApp.Checked = true;

            this.chkShortcut.Font = new Font("Segoe UI", 8.5F);
            this.chkShortcut.Location = new Point(12, 205);
            this.chkShortcut.Size = new Size(300, 24);
            this.chkShortcut.Text = "Create desktop shortcut";
            this.chkShortcut.Checked = true;

            this.rightFinishPanel.Controls.Add(this.lblFinishTitle);
            this.rightFinishPanel.Controls.Add(this.lblFinishDesc);
            this.rightFinishPanel.Controls.Add(this.chkRunApp);
            this.rightFinishPanel.Controls.Add(this.chkShortcut);
            this.finishPanel.Controls.Add(this.leftFinishPanel);
            this.finishPanel.Controls.Add(this.rightFinishPanel);

            // 
            // Control Buttons
            // 
            this.btnBack.Font = new Font("Segoe UI", 8.5F);
            this.btnBack.Location = new Point(210, 323);
            this.btnBack.Size = new Size(80, 25);
            this.btnBack.Text = "< Back";
            this.btnBack.Click += new EventHandler(this.btnBack_Click);

            this.btnNext.Font = new Font("Segoe UI", 8.5F);
            this.btnNext.Location = new Point(295, 323);
            this.btnNext.Size = new Size(80, 25);
            this.btnNext.Text = "Next >";
            this.btnNext.Click += new EventHandler(this.btnNext_Click);

            this.btnCancel.Font = new Font("Segoe UI", 8.5F);
            this.btnCancel.Location = new Point(390, 323);
            this.btnCancel.Size = new Size(80, 25);
            this.btnCancel.Text = "Cancel";
            this.btnCancel.Click += new EventHandler(this.btnCancel_Click);

            // 
            // Add to Form
            // 
            this.Controls.Add(this.bannerPanel);
            this.Controls.Add(this.welcomePanel);
            this.Controls.Add(this.licensePanel);
            this.Controls.Add(this.folderPanel);
            this.Controls.Add(this.progressPanel);
            this.Controls.Add(this.finishPanel);
            this.Controls.Add(this.bottomBorder);
            this.Controls.Add(this.btnBack);
            this.Controls.Add(this.btnNext);
            this.Controls.Add(this.btnCancel);

            this.welcomePanel.SuspendLayout();
            this.licensePanel.SuspendLayout();
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
            licensePanel.Visible = (step == 1);
            folderPanel.Visible = (step == 2);
            progressPanel.Visible = (step == 3);
            finishPanel.Visible = (step == 4);

            // Welcome(0) と Finish(4) は上部バナーがない(非表示にする)
            bannerPanel.Visible = (step != 0 && step != 4);

            // 戻るボタンの制御: Step 0 または 進行中(3) または 完了(4) では押せない
            btnBack.Enabled = (step > 0 && step < 3);

            // キャンセルボタンの制御: 進行中(3) または 完了(4) 以降はキャンセル不可
            btnCancel.Enabled = (step < 3);

            if (step == 0)
            {
                btnNext.Text = "Next >";
                btnNext.Enabled = true;
            }
            else if (step == 1) // License
            {
                lblBannerTitle.Text = "License Agreement";
                lblBannerSub.Text = "Please read the license terms carefully before installing.";
                btnNext.Text = "Agree";
                btnNext.Enabled = chkAccept.Checked; // 同意チェック状態に連動
            }
            else if (step == 2) // Folder
            {
                lblBannerTitle.Text = "Choose Install Location";
                lblBannerSub.Text = "Choose the folder in which to install Mana Resonance.";
                btnNext.Text = "Install";
                btnNext.Enabled = true;
            }
            else if (step == 3) // Progress
            {
                lblBannerTitle.Text = "Installing";
                lblBannerSub.Text = "Please wait while Mana Resonance is being installed.";
                btnNext.Text = "Next >";
                btnNext.Enabled = false;
                ExecuteInstallation();
            }
            else if (step == 4) // Finish
            {
                btnNext.Text = "Finish";
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
            if (currentStep == 4)
            {
                // ショートカット作成 (ユーザー選択に連動)
                if (chkShortcut.Checked)
                {
                    CreateDesktopShortcutDirect(txtFolder.Text.Trim());
                }

                // 完了時起動処理
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
            else if (currentStep < 4)
            {
                ShowStep(currentStep + 1);
            }
        }

        private void chkAccept_CheckedChanged(object sender, EventArgs e)
        {
            if (currentStep == 1)
            {
                btnNext.Enabled = chkAccept.Checked;
            }
        }

        private string GetLicenseText()
        {
            return "Mana Resonance License Agreement\r\n\r\n" +
                   "Please read the following license terms carefully before proceeding with the installation.\r\n\r\n" +
                   "1. Open Source and Publicity\r\n" +
                   "This application's source code is publicly available. You are free to distribute, share, and modify the code under public domain rules, subject to these terms.\r\n\r\n" +
                   "2. Disclaimer of Liability (責任の免責)\r\n" +
                   "配布は自由ですが、開発者および権利者は、本ソフトウェアの使用または配布によって生じた一切の責任、損害、クレーム等について、一切の責任を負いません。本ソフトウェアは「現状のまま」提供されます。\r\n\r\n" +
                   "3. Prohibition of Reverse Engineering (リバースエンジニアリングの禁止)\r\n" +
                   "このインストーラーに含まれるバイナリやコンポーネントについて、許可なくリバースエンジニアリング、デコンパイル、逆アセンブル等の行為を行うことは固く禁止します。\r\n\r\n" +
                   "If you agree to these terms, please check \"I accept the terms in the License Agreement\" and click Agree to proceed.";
        }

        private void DrawSidebarWelcome(object sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            // 大きな「Welcome」文字の描画
            using (Font f = new Font("Segoe UI", 16, FontStyle.Bold))
            {
                g.DrawString("Mana\r\nResonance", f, Brushes.White, 15, 30);
            }

            // PCっぽい図形の簡易描画 (NSIS風のレトロなPC)
            using (Pen p = new Pen(Color.FromArgb(100, 255, 255, 255), 2))
            {
                g.DrawRectangle(p, 40, 140, 80, 50); // モニター
                g.DrawLine(p, 80, 190, 80, 210); // スタンド
                g.DrawLine(p, 60, 210, 100, 210); // ベース
                g.DrawRectangle(p, 30, 215, 100, 10); // キーボード
            }
        }

        private void DrawSidebarFinish(object sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            using (Font f = new Font("Segoe UI", 16, FontStyle.Bold))
            {
                g.DrawString("Installation\r\nComplete", f, Brushes.White, 15, 30);
            }

            // チェックマークの描画 (レトロな完成イメージ)
            using (Pen p = new Pen(Color.FromArgb(120, 46, 204, 113), 6))
            {
                p.StartCap = System.Drawing.Drawing2D.LineCap.Round;
                p.EndCap = System.Drawing.Drawing2D.LineCap.Round;
                g.DrawLine(p, 45, 170, 70, 195);
                g.DrawLine(p, 70, 195, 115, 145);
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

                // 3. スタートメニューショートカットの作成 (デスクトップは完了画面で処理)
                string mainExePath = Path.Combine(targetDir, "Mana Resonance.exe");
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
                ShowStep(4); // 完了画面(4)へ
            }
            catch (Exception ex)
            {
                MessageBox.Show("インストール中にエラーが発生しました:\n" + ex.Message, "エラー", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowStep(2); // フォルダ選択画面(2)へ戻す
                btnNext.Enabled = true;
            }
        }

        private void CreateDesktopShortcutDirect(string targetDir)
        {
            try
            {
                string mainExePath = Path.Combine(targetDir, "Mana Resonance.exe");
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktopPath, "Mana Resonance.lnk"), mainExePath, targetDir);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Shortcut creation error: " + ex.Message);
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
                    key.SetValue("ApplicationVersion", "1.0.9");
                    key.SetValue("Publisher", "Mana Resonance Studio");
                    key.SetValue("DisplayIcon", iconPath);
                    key.SetValue("DisplayVersion", "1.0.9");
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
                if (isUpdate && !string.IsNullOrEmpty(downloadUrl))
                {
                    // サイレントかつアップデートURL指定時は、フォームを出さずにバックグラウンドでダウンロードと上書きを実行
                    RunSilentUpdate(downloadUrl);
                }
                else
                {
                    // 通常のサイレントインストール
                    RunSilentInstall();
                }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm(isUpdate, downloadUrl));
        }

        private static void RunSilentUpdate(string downloadUrl)
        {
            try
            {
                string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mana Resonance");
                string tempZip = Path.Combine(Path.GetTempPath(), "mana_silent_update.zip");

                if (File.Exists(tempZip))
                {
                    try { File.Delete(tempZip); } catch {}
                }

                // WebClientによる同期ダウンロード
                using (WebClient client = new WebClient())
                {
                    client.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ElectronUpdater");
                    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
                    client.DownloadFile(downloadUrl, tempZip);
                }

                if (File.Exists(tempZip))
                {
                    // 既存プロセスの強制終了
                    Process[] processes = Process.GetProcessesByName("Mana Resonance");
                    foreach (var process in processes)
                    {
                        try { process.Kill(); process.WaitForExit(3000); } catch {}
                    }

                    // ZIP展開 (上書き)
                    using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue;

                            string destPath = Path.Combine(installDir, entry.FullName);
                            string destSubDir = Path.GetDirectoryName(destPath);

                            if (!Directory.Exists(destSubDir))
                            {
                                Directory.CreateDirectory(destSubDir);
                            }

                            entry.ExtractToFile(destPath, true);
                        }
                    }
                    try { File.Delete(tempZip); } catch {}
                }

                // 最新版を自動起動
                string mainExe = Path.Combine(installDir, "Mana Resonance.exe");
                if (File.Exists(mainExe))
                {
                    Process.Start(mainExe);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Silent update error: " + ex.Message);
            }
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
                        key.SetValue("ApplicationVersion", "1.0.9");
                        key.SetValue("Publisher", "Mana Resonance Studio");
                        key.SetValue("DisplayIcon", iconPath);
                        key.SetValue("DisplayVersion", "1.0.9");
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
