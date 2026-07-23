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
using System.Threading.Tasks;

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

        // ウェルカム画面
        private Panel welcomePanel;
        private Panel leftWelcomePanel;
        private Panel rightWelcomePanel;
        private Label lblWelcomeTitle;
        private Label lblWelcomeDesc;
        private Label lblLangSelect;
        private ComboBox cmbLanguage;

        // ライセンス規約画面
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

        // 完了画面
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
        private string currentLanguage = "EN"; // Default: EN

        private bool isUpdateMode = false;
        private string updateDownloadUrl = "";

        // 規約テキスト (英語 / 日本語)
        private const string LICENSE_EN = 
            "END USER LICENSE AGREEMENT FOR MANA RESONANCE\r\n\r\n" +
            "1. TERMS OF USE\r\n" +
            "Mana Resonance is an audio analytics software. You are granted a non-exclusive license to use this application for personal or commercial purposes.\r\n\r\n" +
            "2. NO WARRANTY\r\n" +
            "THE SOFTWARE IS PROVIDED 'AS IS' WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\r\n\r\n" +
            "3. INTELLECTUAL PROPERTY\r\n" +
            "All title, copyright, and intellectual property rights in and to the Software are owned by Mana Resonance Team.";

        private const string LICENSE_JA = 
            "Mana Resonance エンドユーザー使用許諾契約書\r\n\r\n" +
            "1. 使用許諾\r\n" +
            "本ソフトウェア「Mana Resonance」は音響解析アプリケーションです。ユーザーは個人用または商用利用の目的で本アプリケーションを使用する非独占的権利を許諾されます。\r\n\r\n" +
            "2. 無保証\r\n" +
            "本ソフトウェアは「現状のまま」提供され、明示的か暗黙的かを問わず、いかなる種類の保証も行われません。\r\n\r\n" +
            "3. 著作権\r\n" +
            "本ソフトウェアに関するすべての所有権および著作権は Mana Resonance 開発チームに帰属します。";

        public InstallerForm(bool isUpdate = false, string downloadUrl = "")
        {
            this.isUpdateMode = isUpdate;
            this.updateDownloadUrl = downloadUrl;

            defaultInstallPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mana Resonance");
            
            currentLanguage = DetectLanguage();

            InitializeComponent();
            
            ApplyLanguage(currentLanguage);

            if (isUpdateMode)
            {
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

            // ウェルカム画面
            this.welcomePanel = new Panel();
            this.leftWelcomePanel = new Panel();
            this.rightWelcomePanel = new Panel();
            this.lblWelcomeTitle = new Label();
            this.lblWelcomeDesc = new Label();
            this.lblLangSelect = new Label();
            this.cmbLanguage = new ComboBox();

            // ライセンス規約画面
            this.licensePanel = new Panel();
            this.lblLicenseDesc = new Label();
            this.txtLicense = new TextBox();
            this.chkAccept = new CheckBox();

            // インストール先選択画面
            this.folderPanel = new Panel();
            this.lblFolderDesc = new Label();
            this.txtFolder = new TextBox();
            this.btnBrowse = new Button();

            // プログレス画面
            this.progressPanel = new Panel();
            this.lblProgressDesc = new Label();
            this.progressBar = new ProgressBar();

            // 完了画面
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

            // ★ 標準クラシックホワイトテーマ ★
            this.Text = "Mana Resonance Setup";
            this.ClientSize = new Size(620, 420);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = SystemColors.Control;
            this.ForeColor = SystemColors.ControlText;

            try
            {
                Icon appIcon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                if (appIcon != null) this.Icon = appIcon;
            }
            catch { }

            // 上部ホワイトバナー
            bannerPanel.Size = new Size(620, 65);
            bannerPanel.Location = new Point(0, 0);
            bannerPanel.BackColor = Color.White;

            lblBannerTitle.Location = new Point(15, 12);
            lblBannerTitle.Size = new Size(500, 22);
            lblBannerTitle.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
            lblBannerTitle.ForeColor = Color.Black;

            lblBannerSub.Location = new Point(20, 36);
            lblBannerSub.Size = new Size(500, 20);
            lblBannerSub.Font = new Font("Segoe UI", 9f);
            lblBannerSub.ForeColor = Color.DimGray;

            bannerIcon.Size = new Size(42, 42);
            bannerIcon.Location = new Point(560, 10);
            bannerIcon.SizeMode = PictureBoxSizeMode.Zoom;
            try
            {
                Icon appIcon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                if (appIcon != null) bannerIcon.Image = appIcon.ToBitmap();
            }
            catch { }

            bannerBorder.Size = new Size(620, 1);
            bannerBorder.Location = new Point(0, 65);
            bannerBorder.BackColor = Color.LightGray;

            bannerPanel.Controls.Add(lblBannerTitle);
            bannerPanel.Controls.Add(lblBannerSub);
            bannerPanel.Controls.Add(bannerIcon);
            this.Controls.Add(bannerPanel);
            this.Controls.Add(bannerBorder);

            // 1. ウェルカム画面
            welcomePanel.Size = new Size(620, 305);
            welcomePanel.Location = new Point(0, 66);
            welcomePanel.BackColor = SystemColors.Control;

            leftWelcomePanel.Size = new Size(170, 305);
            leftWelcomePanel.Location = new Point(0, 0);
            leftWelcomePanel.BackColor = Color.FromArgb(240, 243, 248);

            rightWelcomePanel.Size = new Size(450, 305);
            rightWelcomePanel.Location = new Point(170, 0);
            rightWelcomePanel.BackColor = SystemColors.Control;

            lblWelcomeTitle.Location = new Point(20, 25);
            lblWelcomeTitle.Size = new Size(410, 50);
            lblWelcomeTitle.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
            lblWelcomeTitle.ForeColor = Color.FromArgb(40, 60, 120);

            lblWelcomeDesc.Location = new Point(20, 85);
            lblWelcomeDesc.Size = new Size(410, 110);
            lblWelcomeDesc.Font = new Font("Segoe UI", 9.5f);
            lblWelcomeDesc.ForeColor = Color.Black;

            // 言語選択
            lblLangSelect.Location = new Point(20, 215);
            lblLangSelect.Size = new Size(140, 22);
            lblLangSelect.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            lblLangSelect.ForeColor = Color.Black;

            cmbLanguage.Location = new Point(160, 212);
            cmbLanguage.Size = new Size(170, 26);
            cmbLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbLanguage.Items.Add("English (Default)");
            cmbLanguage.Items.Add("日本語 (Japanese)");
            cmbLanguage.SelectedIndex = 0;
            cmbLanguage.SelectedIndexChanged += (s, e) => {
                string sel = cmbLanguage.SelectedIndex == 1 ? "JA" : "EN";
                ApplyLanguage(sel);
            };

            rightWelcomePanel.Controls.Add(lblWelcomeTitle);
            rightWelcomePanel.Controls.Add(lblWelcomeDesc);
            rightWelcomePanel.Controls.Add(lblLangSelect);
            rightWelcomePanel.Controls.Add(cmbLanguage);
            welcomePanel.Controls.Add(leftWelcomePanel);
            welcomePanel.Controls.Add(rightWelcomePanel);
            this.Controls.Add(welcomePanel);

            // 2. ライセンス規約画面 (白背景・動的規約切替)
            licensePanel.Size = new Size(620, 305);
            licensePanel.Location = new Point(0, 66);
            licensePanel.BackColor = SystemColors.Control;
            licensePanel.Visible = false;

            lblLicenseDesc.Location = new Point(20, 15);
            lblLicenseDesc.Size = new Size(580, 22);
            lblLicenseDesc.Font = new Font("Segoe UI", 9f);
            lblLicenseDesc.ForeColor = Color.Black;

            txtLicense.Location = new Point(20, 42);
            txtLicense.Size = new Size(580, 215);
            txtLicense.Multiline = true;
            txtLicense.ReadOnly = true;
            txtLicense.ScrollBars = ScrollBars.Vertical;
            txtLicense.BackColor = Color.White;
            txtLicense.ForeColor = Color.Black;
            txtLicense.Font = new Font("Consolas", 9f);

            chkAccept.Location = new Point(20, 267);
            chkAccept.Size = new Size(580, 25);
            chkAccept.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            chkAccept.ForeColor = Color.Black;
            chkAccept.CheckedChanged += (s, e) => { btnNext.Enabled = chkAccept.Checked; };

            licensePanel.Controls.Add(lblLicenseDesc);
            licensePanel.Controls.Add(txtLicense);
            licensePanel.Controls.Add(chkAccept);
            this.Controls.Add(licensePanel);

            // 3. インストール先選択画面
            folderPanel.Size = new Size(620, 305);
            folderPanel.Location = new Point(0, 66);
            folderPanel.BackColor = SystemColors.Control;
            folderPanel.Visible = false;

            lblFolderDesc.Location = new Point(20, 25);
            lblFolderDesc.Size = new Size(580, 40);
            lblFolderDesc.Font = new Font("Segoe UI", 9.5f);
            lblFolderDesc.ForeColor = Color.Black;

            txtFolder.Location = new Point(20, 80);
            txtFolder.Size = new Size(470, 26);
            txtFolder.Font = new Font("Segoe UI", 9.5f);
            txtFolder.Text = defaultInstallPath;

            btnBrowse.Location = new Point(500, 78);
            btnBrowse.Size = new Size(95, 28);
            btnBrowse.FlatStyle = FlatStyle.System;
            btnBrowse.Click += BtnBrowse_Click;

            folderPanel.Controls.Add(lblFolderDesc);
            folderPanel.Controls.Add(txtFolder);
            folderPanel.Controls.Add(btnBrowse);
            this.Controls.Add(folderPanel);

            // 4. プログレス画面
            progressPanel.Size = new Size(620, 305);
            progressPanel.Location = new Point(0, 66);
            progressPanel.BackColor = SystemColors.Control;
            progressPanel.Visible = false;

            lblProgressDesc.Location = new Point(20, 50);
            lblProgressDesc.Size = new Size(580, 30);
            lblProgressDesc.Font = new Font("Segoe UI", 9.5f);
            lblProgressDesc.ForeColor = Color.Black;

            progressBar.Location = new Point(20, 95);
            progressBar.Size = new Size(580, 26);
            progressBar.Style = ProgressBarStyle.Continuous;

            progressPanel.Controls.Add(lblProgressDesc);
            progressPanel.Controls.Add(progressBar);
            this.Controls.Add(progressPanel);

            // 5. 完了画面
            finishPanel.Size = new Size(620, 305);
            finishPanel.Location = new Point(0, 66);
            finishPanel.BackColor = SystemColors.Control;
            finishPanel.Visible = false;

            leftFinishPanel.Size = new Size(170, 305);
            leftFinishPanel.Location = new Point(0, 0);
            leftFinishPanel.BackColor = Color.FromArgb(240, 243, 248);

            rightFinishPanel.Size = new Size(450, 305);
            rightFinishPanel.Location = new Point(170, 0);
            rightFinishPanel.BackColor = SystemColors.Control;

            lblFinishTitle.Location = new Point(20, 25);
            lblFinishTitle.Size = new Size(410, 40);
            lblFinishTitle.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
            lblFinishTitle.ForeColor = Color.FromArgb(40, 60, 120);

            lblFinishDesc.Location = new Point(20, 75);
            lblFinishDesc.Size = new Size(410, 70);
            lblFinishDesc.Font = new Font("Segoe UI", 9.5f);
            lblFinishDesc.ForeColor = Color.Black;

            chkRunApp.Location = new Point(20, 160);
            chkRunApp.Size = new Size(410, 25);
            chkRunApp.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            chkRunApp.ForeColor = Color.Black;
            chkRunApp.Checked = true;

            chkShortcut.Location = new Point(20, 195);
            chkShortcut.Size = new Size(410, 25);
            chkShortcut.Font = new Font("Segoe UI", 9.5f);
            chkShortcut.ForeColor = Color.Black;
            chkShortcut.Checked = true;

            rightFinishPanel.Controls.Add(lblFinishTitle);
            rightFinishPanel.Controls.Add(lblFinishDesc);
            rightFinishPanel.Controls.Add(chkRunApp);
            rightFinishPanel.Controls.Add(chkShortcut);
            finishPanel.Controls.Add(leftFinishPanel);
            finishPanel.Controls.Add(rightFinishPanel);
            this.Controls.Add(finishPanel);

            // 下部バー＆ボタン
            bottomBorder.Size = new Size(620, 1);
            bottomBorder.Location = new Point(0, 371);
            bottomBorder.BackColor = Color.LightGray;
            this.Controls.Add(bottomBorder);

            btnBack.Location = new Point(330, 382);
            btnBack.Size = new Size(85, 28);
            btnBack.FlatStyle = FlatStyle.System;
            btnBack.Click += (s, e) => ShowStep(currentStep - 1);

            btnNext.Location = new Point(423, 382);
            btnNext.Size = new Size(85, 28);
            btnNext.FlatStyle = FlatStyle.System;
            btnNext.Click += BtnNext_Click;

            btnCancel.Location = new Point(516, 382);
            btnCancel.Size = new Size(85, 28);
            btnCancel.FlatStyle = FlatStyle.System;
            btnCancel.Click += (s, e) => this.Close();

            this.Controls.Add(btnBack);
            this.Controls.Add(btnNext);
            this.Controls.Add(btnCancel);

            this.ResumeLayout(false);
        }

        private void ApplyLanguage(string lang)
        {
            currentLanguage = lang;
            if (lang == "JA")
            {
                lblWelcomeTitle.Text = "Mana Resonance へようこそ";
                lblWelcomeDesc.Text = "Mana Resonance のセットアップウィザードです。\r\nお使いのコンピューターに Mana Resonance をインストールします。\r\n続行するには「次へ」をクリックしてください。";
                lblLangSelect.Text = "表示言語 (Language):";

                lblLicenseDesc.Text = "使用許諾契約書をお読みいただき、同意される場合はチェックを入れてください。";
                txtLicense.Text = LICENSE_JA; // 動的規約切替
                chkAccept.Text = "使用許諾契約書の利用規約に同意します";

                lblFolderDesc.Text = "Mana Resonance のインストール先フォルダを指定してください。";
                btnBrowse.Text = "参照...";

                lblProgressDesc.Text = "ファイルを展開しています。しばらくお待ちください...";

                lblFinishTitle.Text = "セットアップが完了しました";
                lblFinishDesc.Text = "Mana Resonance のインストールが正常に完了しました。";
                chkRunApp.Text = "Mana Resonance を今すぐ起動する";
                chkShortcut.Text = "デスクトップにショートカットを作成する";

                btnBack.Text = "< 戻る";
                btnCancel.Text = "キャンセル";
                if (currentStep == 2) btnNext.Text = "インストール";
                else if (currentStep == 4) btnNext.Text = "完了";
                else btnNext.Text = "次へ >";
            }
            else
            {
                lblWelcomeTitle.Text = "Welcome to Mana Resonance";
                lblWelcomeDesc.Text = "This wizard will guide you through the installation of Mana Resonance on your computer.\r\n\r\nClick Next to continue.";
                lblLangSelect.Text = "Select Language:";

                lblLicenseDesc.Text = "Please read the License Agreement and check the box below if you agree.";
                txtLicense.Text = LICENSE_EN; // 動的規約切替
                chkAccept.Text = "I accept the terms in the License Agreement";

                lblFolderDesc.Text = "Select the destination folder where Mana Resonance will be installed.";
                btnBrowse.Text = "Browse...";

                lblProgressDesc.Text = "Extracting files and configuring setup. Please wait...";

                lblFinishTitle.Text = "Installation Completed";
                lblFinishDesc.Text = "Mana Resonance has been successfully installed on your system.";
                chkRunApp.Text = "Launch Mana Resonance now";
                chkShortcut.Text = "Create a Desktop shortcut";

                btnBack.Text = "< Back";
                btnCancel.Text = "Cancel";
                if (currentStep == 2) btnNext.Text = "Install";
                else if (currentStep == 4) btnNext.Text = "Finish";
                else btnNext.Text = "Next >";
            }
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            welcomePanel.Visible = (step == 0);
            licensePanel.Visible = (step == 1);
            folderPanel.Visible = (step == 2);
            progressPanel.Visible = (step == 3);
            finishPanel.Visible = (step == 4);

            btnBack.Enabled = (step > 0 && step < 3);
            btnCancel.Enabled = (step != 3);

            if (step == 0)
            {
                lblBannerTitle.Text = currentLanguage == "JA" ? "Mana Resonance セットアップ" : "Mana Resonance Setup";
                lblBannerSub.Text = currentLanguage == "JA" ? "オーディオアナリティクススイート" : "Professional Audio Analytics Suite";
            }
            else if (step == 1)
            {
                lblBannerTitle.Text = currentLanguage == "JA" ? "使用許諾契約書" : "License Agreement";
                lblBannerSub.Text = currentLanguage == "JA" ? "規約に同意して続行してください" : "Please review the license terms before installing";
                btnNext.Enabled = chkAccept.Checked;
            }
            else if (step == 2)
            {
                lblBannerTitle.Text = currentLanguage == "JA" ? "インストール先フォルダの選択" : "Select Installation Folder";
                lblBannerSub.Text = currentLanguage == "JA" ? "プログラムの保存先を指定してください" : "Choose the folder in which to install the application";
                btnNext.Text = currentLanguage == "JA" ? "インストール" : "Install";
                btnNext.Enabled = true;
            }
            else if (step == 3)
            {
                lblBannerTitle.Text = currentLanguage == "JA" ? "インストール中" : "Installing Mana Resonance";
                lblBannerSub.Text = currentLanguage == "JA" ? "処理が完了するまでお待ちください" : "Please wait while files are extracted to your computer";
                btnNext.Enabled = false;
                btnBack.Enabled = false;
            }
            else if (step == 4)
            {
                lblBannerTitle.Text = currentLanguage == "JA" ? "完了" : "Completed";
                lblBannerSub.Text = currentLanguage == "JA" ? "セットアップが完了しました" : "Wizard setup complete";
                btnNext.Text = currentLanguage == "JA" ? "完了" : "Finish";
                btnNext.Enabled = true;
            }
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dlg = new FolderBrowserDialog())
            {
                dlg.SelectedPath = txtFolder.Text;
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    txtFolder.Text = Path.Combine(dlg.SelectedPath, "Mana Resonance");
                }
            }
        }

        private void BtnNext_Click(object sender, EventArgs e)
        {
            if (currentStep < 2)
            {
                ShowStep(currentStep + 1);
            }
            else if (currentStep == 2)
            {
                ShowStep(3);
                PerformInstallation();
            }
            else if (currentStep == 4)
            {
                if (chkRunApp.Checked)
                {
                    string exePath = Path.Combine(txtFolder.Text, "Mana Resonance.exe");
                    if (File.Exists(exePath))
                    {
                        Process.Start(exePath);
                    }
                }
                this.Close();
            }
        }

        private async void PerformInstallation()
        {
            string targetDir = txtFolder.Text;
            try
            {
                // アプリ実行中であれば確実にプロセスを終了させる
                foreach (var proc in Process.GetProcessesByName("Mana Resonance"))
                {
                    try { proc.Kill(); proc.WaitForExit(2000); } catch { }
                }

                if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

                string langFilePath = Path.Combine(targetDir, "language.txt");
                File.WriteAllText(langFilePath, currentLanguage);

                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream zipStream = assembly.GetManifestResourceStream("app.zip"))
                {
                    if (zipStream != null)
                    {
                        string tempZip = Path.Combine(Path.GetTempPath(), "mana_app_temp.zip");
                        using (FileStream fs = new FileStream(tempZip, FileMode.Create))
                        {
                            await zipStream.CopyToAsync(fs);
                        }

                        progressBar.Value = 40;
                        await Task.Delay(300);

                        // 既存ファイルを強制上書き展開 (overwriteFiles: true)
                        using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string destinationPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                                if (string.IsNullOrEmpty(entry.Name))
                                {
                                    Directory.CreateDirectory(destinationPath);
                                }
                                else
                                {
                                    string dir = Path.GetDirectoryName(destinationPath);
                                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                    entry.ExtractToFile(destinationPath, true);
                                }
                            }
                        }

                        File.Delete(tempZip);
                        progressBar.Value = 75;
                    }
                }

                using (Stream uninstStream = assembly.GetManifestResourceStream("uninstaller.exe"))
                {
                    if (uninstStream != null)
                    {
                        string uninstPath = Path.Combine(targetDir, "uninstaller.exe");
                        using (FileStream fs = new FileStream(uninstPath, FileMode.Create))
                        {
                            await uninstStream.CopyToAsync(fs);
                        }
                    }
                }

                if (chkShortcut.Checked)
                {
                    CreateDesktopShortcut(targetDir);
                }

                RegisterControlPanelUninstall(targetDir);

                progressBar.Value = 100;
                await Task.Delay(400);

                ShowStep(4);
            }
            catch (Exception ex)
            {
                MessageBox.Show((currentLanguage == "JA" ? "インストール中にエラーが発生しました:\n" : "Installation failed:\n") + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ShowStep(2);
            }
        }

        private void CreateDesktopShortcut(string targetDir)
        {
            try
            {
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktopPath, "Mana Resonance.lnk");
                string exePath = Path.Combine(targetDir, "Mana Resonance.exe");

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = exePath;
                shortcut.WorkingDirectory = targetDir;
                shortcut.Description = "Mana Resonance Audio Analytics Suite";
                shortcut.Save();
            }
            catch { }
        }

        private void RegisterControlPanelUninstall(string targetDir)
        {
            try
            {
                string keyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ManaResonance";
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(keyPath))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "Mana Resonance");
                        key.SetValue("DisplayVersion", "1.1.5");
                        key.SetValue("Publisher", "Mana Resonance Team");
                        key.SetValue("UninstallString", "\"" + Path.Combine(targetDir, "uninstaller.exe") + "\"");
                        key.SetValue("DisplayIcon", Path.Combine(targetDir, "Mana Resonance.exe"));
                        key.SetValue("InstallLocation", targetDir);
                    }
                }
            }
            catch { }
        }

        private async void StartUpdateDownload()
        {
            try
            {
                progressBar.Value = 10;
                string tempZip = Path.Combine(Path.GetTempPath(), "mana_update.zip");
                using (WebClient client = new WebClient())
                {
                    client.DownloadProgressChanged += (s, e) => {
                        progressBar.Value = 10 + (int)(e.ProgressPercentage * 0.7);
                    };
                    await client.DownloadFileTaskAsync(new Uri(updateDownloadUrl), tempZip);
                }

                string targetDir = defaultInstallPath;
                ZipFile.ExtractToDirectory(tempZip, targetDir);
                File.Delete(tempZip);

                progressBar.Value = 100;
                await Task.Delay(400);
                ShowStep(4);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Update Failed: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                this.Close();
            }
        private static string DetectLanguage()
        {
            try
            {
                // 1. AppData 内の config.json を探索 (ユーザーの最新設定を最優先)
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
                string programFilesPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Mana Resonance", "language.txt");
                if (File.Exists(programFilesPath))
                {
                    string content = File.ReadAllText(programFilesPath).Trim().ToUpper();
                    if (content == "JA" || content == "EN") return content;
                }
            }
            catch { }

            return "EN";
        }

        // ★ 自動UAC管理者権限昇格Main ★
        [STAThread]
        public static void Main(string[] args)
        {
            bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (!isAdmin)
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = Application.ExecutablePath;
                psi.Verb = "runas"; // UAC管理者権限へ自動昇格
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
            bool isUpdate = args.Length > 0 && args[0] == "--update";
            string url = (args.Length > 1) ? args[1] : "";
            Application.Run(new InstallerForm(isUpdate, url));
        }
    }
}
