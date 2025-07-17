document.addEventListener('DOMContentLoaded', () => {
    // ... 既存のDOM要素の取得 ...
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const fileListContainer = document.getElementById('file-list-container');
    const statusArea = document.getElementById('status-area');
    const statusMessageContent = document.getElementById('status-message-content');
    const closeStatusButton = statusArea.querySelector('.close-status-button');
    const currentDirectoryDisplay = document.getElementById('current-directory-display');
    const scenarioButtons = document.querySelectorAll('.scenario-buttons button:not(#reset-button)');
    const resetButton = document.getElementById('reset-button');

    let activeOverlay = null;

    // 仮想的なファイルデータ（初期状態）- これはlocalStorageがない場合のフォールバックとリセット用
    const initialUserAFiles = [
        { name: 'document.txt', type: 'file', owner: 'user_A', permissions: 'rw-r--r--', content: 'これは重要な文書の内容です。機密情報が含まれる可能性があります。\n\n- プロジェクトXの進捗\n- 顧客Zとの契約条件\n- 社内ネットワーク構成図\n\nこの情報が外部に漏洩すると、会社に甚大な被害が生じるでしょう。' },
        { name: 'image.jpg', type: 'file', owner: 'user_A', permissions: 'rw-r--r--', imageUrl: 'https://sec.wim-cc.com/app/os_cmd_injection/image.jpg' }, // ここにご自身の画像URLを設定
        { name: 'config.ini', type: 'file', owner: 'root', permissions: 'rw-r-----', content: '[Server]\nPort=8080\nDebug=false\nDB_Host=localhost\nDB_User=admin\nDB_Pass=supersecret_db_password\nAuth_Key=very_strong_key_12345' }, // root所有の機密ファイル
        { name: 'secret_plans.pdf', type: 'file', owner: 'user_A', permissions: 'rw-------', content: 'このPDFは暗号化されており、通常は閲覧できません。不正なアクセスは検知されます。\n\n--- ACCESS DENIED ---' },
        { name: 'README.md', type: 'file', owner: 'user_A', permissions: 'rw-r--r--', content: '# README\nこのディレクトリには重要なファイルが格納されています。\nアクセス権限に注意してください。' }
    ];

    const initialUserBFiles = [
        { name: 'report.docx', type: 'file', owner: 'user_B', permissions: 'rw-rw-r--', content: 'User Bの月次レポートです。\n業績データと今後の計画が記載されています。\n\n目標達成率：85%\n次期目標：110%\n課題：リソース不足' },
        { name: 'presentation.pptx', type: 'file', owner: 'user_B', permissions: 'rw-rw-r--', content: 'User Bのプレゼンテーション資料です。\n重要な会議で使用されます。\n\n- はじめに\n- 現状分析\n- 解決策の提案\n- 今後の展望\n- 質疑応答' },
        { name: 'budget_data.xlsx', type: 'file', owner: 'user_B', permissions: 'rw-r-----', content: 'User Bの予算データ。機密情報。\n\n2025年Q1予算:\n- 開発費: $1,500,000\n- マーケティング費: $800,000\n- 人件費: $2,000,000\n- その他: $300,000' },
        { name: 'memo.txt', type: 'file', owner: 'user_B', permissions: 'rw-r--r--', content: 'User Bが作成したメモです。\n- 明日の会議 10:00 (会議室A)\n- プロジェクト進捗確認 14:00 (オンライン)\n- 報告書提出 締め切り：今日中' },
        { name: 'user_b_photo.jpg', type: 'file', owner: 'user_B', permissions: 'rw-r--r--', imageUrl: 'https://sec.wim-cc.com/app/os_cmd_injection/user_b_photo.jpg' }
    ];

    let virtualFiles; // アプリケーションの状態を保持する変数
    let displayedFiles = []; // 現在表示されているファイル（フィルタリング、削除の影響を受ける）

    // --- ここから追加・変更 ---

    const LOCAL_STORAGE_KEY_DIR = 'os_cmd_injection_current_dir';
    const LOCAL_STORAGE_KEY_FILES = 'os_cmd_injection_virtual_files';

    // データの保存
    function saveAppState() {
        localStorage.setItem(LOCAL_STORAGE_KEY_DIR, currentDirectory);
        // JSON.stringifyでオブジェクトを文字列に変換して保存
        localStorage.setItem(LOCAL_STORAGE_KEY_FILES, JSON.stringify(virtualFiles));
    }

    // データの読み込み
    function loadAppState() {
        const savedDir = localStorage.getItem(LOCAL_STORAGE_KEY_DIR);
        const savedFilesString = localStorage.getItem(LOCAL_STORAGE_KEY_FILES);

        if (savedDir && savedFilesString) {
            try {
                // JSON.parseで文字列をオブジェクトに戻す
                const loadedFiles = JSON.parse(savedFilesString);
                currentDirectory = savedDir;
                virtualFiles = loadedFiles;
                console.log("App state loaded from localStorage.");
                return true; // 読み込み成功
            } catch (e) {
                console.error("Error loading app state from localStorage:", e);
                // パースエラーの場合は初期状態にフォールバック
                return false;
            }
        }
        return false; // データが見つからない
    }

    // --- ここまで追加・変更 ---

    // 8進数パーミッションを記号形式に変換する関数 (変更なし)
    const convertOctalToSymbolic = (octal) => {
        if (octal.length !== 3 || !/^[0-7]+$/.test(octal)) {
            return '---------';
        }
        const modes = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
        const user = modes[parseInt(octal[0], 10)];
        const group = modes[parseInt(octal[1], 10)];
        const others = modes[parseInt(octal[2], 10)];
        return `${user}${group}${others}`;
    };

    // ファイル一覧をレンダリングする関数
    function renderFileList(filesToDisplay) {
        fileListContainer.innerHTML = '';
        if (!filesToDisplay || filesToDisplay.length === 0) {
            fileListContainer.innerHTML = '<p class="no-files">ファイルが見つかりません。</p>';
            return;
        }
        filesToDisplay.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-info" data-filename="${file.name}">
                    <span class="file-permissions">${file.permissions}</span>
                    <span class="file-owner">${file.owner}</span>
                    ${file.name}
                </span>
                <div class="file-actions">
                    <button class="download-button" data-filename="${file.name}">ダウンロード</button>
                    <button class="delete-button" data-filename="${file.name}">削除</button>
                </div>
                <div class="file-content-overlay" data-filename="${file.name}"></div>
            `;
            fileListContainer.appendChild(fileItem);
        });

        // ダウンロード/削除ボタンにイベントリスナーを設定
        document.querySelectorAll('.download-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const filename = e.target.dataset.filename;
                showStatus(`「${filename}」をダウンロードしました！ (実際にはダウンロードされません)`, 'success');
            });
        });

        document.querySelectorAll('.delete-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const filename = e.target.dataset.filename;
                // --- ここから変更 ---
                // displayedFiles からも削除
                displayedFiles = displayedFiles.filter(f => f.name !== filename);
                // virtualFiles からも削除
                if (virtualFiles[currentDirectory]) {
                    virtualFiles[currentDirectory] = virtualFiles[currentDirectory].filter(f => f.name !== filename);
                }
                saveAppState(); // 状態変更後に保存
                renderFileList(displayedFiles); // リレンダリング
                // --- ここまで変更 ---
                showStatus(`「${filename}」を削除しました。(表示上)`, 'info');
            });
        });

        // ファイル名部分のクリックイベント（ファイル内容表示用）
        document.querySelectorAll('.file-item .file-info').forEach(fileInfoSpan => {
            fileInfoSpan.addEventListener('click', (e) => {
                const filename = e.currentTarget.dataset.filename;
                // 現在のvirtualFilesからファイル情報を取得
                const file = (virtualFiles[currentDirectory] || []).find(f => f.name === filename);
                const overlay = e.currentTarget.closest('.file-item').querySelector('.file-content-overlay');

                if (file) {
                    if (activeOverlay && activeOverlay !== overlay) {
                        activeOverlay.classList.remove('active');
                        activeOverlay.innerHTML = '';
                    }

                    if (overlay.classList.contains('active')) {
                        overlay.classList.remove('active');
                        overlay.innerHTML = '';
                        activeOverlay = null;
                    } else {
                        overlay.innerHTML = '';

                        if (file.type === 'file') {
                            if (file.content) {
                                overlay.innerHTML = `<h4>${filename} の内容:</h4><pre>${file.content}</pre>`;
                            } else if (file.imageUrl) {
                                overlay.innerHTML = `<h4>${filename} のプレビュー:</h4><img src="${file.imageUrl}" alt="${file.name}">`;
                            } else {
                                overlay.innerHTML = `<p>このファイル (${filename}) はプレビューできません。</p>`;
                            }
                        } else {
                            overlay.innerHTML = `<p>このファイル (${filename}) はプレビューできません。</p>`;
                        }
                        overlay.classList.add('active');
                        activeOverlay = overlay;
                    }
                }
            });
        });
    }

    // ステータスメッセージを表示する関数 (変更なし)
    function showStatus(message, type = 'info') {
        statusMessageContent.innerHTML = message;
        statusArea.className = `status-bar ${type}`;
        statusArea.style.display = 'block';
    }

    // アプリケーションの状態を初期化する関数
    function resetApp() {
        currentDirectory = '/home/user_A/';
        currentDirectoryDisplay.textContent = currentDirectory;
        // virtualFiles を初期データでディープコピーしてリセット
        virtualFiles = {
            '/home/user_A/': JSON.parse(JSON.stringify(initialUserAFiles)),
            '/home/user_B/': JSON.parse(JSON.stringify(initialUserBFiles))
        };
        saveAppState(); // リセット後に状態を保存
        displayedFiles = [...virtualFiles[currentDirectory]];
        renderFileList(displayedFiles);
        searchInput.value = '';
        statusArea.style.display = 'none';
        showStatus('アプリケーションの状態が初期化されました。', 'info');
        setTimeout(() => statusArea.style.display = 'none', 3000);

        if (fileListContainer.classList.contains('hacked-view')) {
            fileListContainer.classList.remove('hacked-view');
        }

        if (activeOverlay) {
            activeOverlay.classList.remove('active');
            activeOverlay.innerHTML = '';
            activeOverlay = null;
        }
    }

    // 検索処理を行う関数
    function performSearch(input) {
        statusArea.style.display = 'none';

        if (fileListContainer.classList.contains('hacked-view')) {
            fileListContainer.classList.remove('hacked-view');
            // --- ここから変更 ---
            // hackedViewから戻った場合は、現在のvirtualFilesを元に再レンダリング
            displayedFiles = [...virtualFiles[currentDirectory]];
            renderFileList(displayedFiles);
            // --- ここまで変更 ---
        }

        if (activeOverlay) {
            activeOverlay.classList.remove('active');
            activeOverlay.innerHTML = '';
            activeOverlay = null;
        }

        const simulatedCommandPrefix = `find ${currentDirectoryDisplay.textContent.trim()}`;
        showStatus(`内部コマンド実行: <code>${simulatedCommandPrefix}${input}</code>`, 'info');

        if (input.includes('&')) {
            const parts = input.split('&').map(p => p.trim());
            const firstFindArgument = parts[0];
            const injectedCommand = parts[1];

            if (injectedCommand.startsWith('cd /home/user_B/')) {
                currentDirectory = '/home/user_B/';
                currentDirectoryDisplay.textContent = currentDirectory;
                displayedFiles = [...(virtualFiles[currentDirectory] || [])];
                saveAppState(); // 状態変更後に保存
                renderFileList(displayedFiles);
                showStatus(`
                    <strong><span style="color: red;">警告！</span> 不正なコマンドが実行されました！</strong><br>
                    ディレクトリが <code>${currentDirectory}</code> に変更されました。<br>
                    (find ${firstFindArgument} & <strong>cd /home/user_B/</strong>)
                `, 'warning');
            } else if (injectedCommand.startsWith('rm /home/user_B/ -R')) {
                if (currentDirectory === '/home/user_B/') {
                    virtualFiles['/home/user_B/'] = [];
                    saveAppState(); // 状態変更後に保存
                    displayedFiles = [];
                    renderFileList(displayedFiles);
                    showStatus(`
                        <strong><span style="color: red;">緊急事態発生！</span></strong><br>
                        <code>/home/user_B/</code> 内の**すべてのファイルとディレクトリが削除されました！**<br>
                        (find ${firstFindArgument} & <strong>rm /home/user_B/ -R</strong>)<br>
                        <br>
                        これは、OSコマンドインジェクションと**ずさんな権限設定**が重なった結果です。
                        このシステムでは、User_Bのデータ保護が甘かったため、完全に消去されてしまいました。
                    `, 'error');
                    currentDirectory = '/home/user_B/';
                    currentDirectoryDisplay.textContent = currentDirectory;
                } else {
                    showStatus(`エラー: <code>rm /home/user_B/ -R</code> を実行しようとしましたが、<br>
                                現在のディレクトリは <code>${currentDirectory}</code> です。<br>
                                このシミュレーションでは、まず対象ディレクトリに移動する必要があります。`, 'error');
                    displayedFiles = (virtualFiles[currentDirectory] || []).filter(file => file.name.includes(firstFindArgument));
                    renderFileList(displayedFiles);
                }
            } else if (injectedCommand.startsWith('cat /etc/passwd')) {
                showStatus(`
                    <strong><span style="color: red;">重大なセキュリティ違反！</span></strong><br>
                    <code>/etc/passwd</code> の内容が不正に読み取られました！<br>
                    これにより、システム上のユーザー情報が漏洩しました。<br>
                    <br>
                    <div style="background-color: #fdd; border: 1px solid #f99; padding: 10px; margin-top: 10px; font-family: monospace; overflow-x: auto;">
                        root:x:0:0:root:/root:/bin/bash<br>
                        daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin<br>
                        bin:x:2:2:bin:/bin:/usr/sbin/nologin<br>
                        sys:x:3:3:sys:/dev:/usr/sbin/nologin<br>
                        ...<br>
                        user_A:x:1000:1000:User A:/home/user_A:/bin/bash<br>
                        user_B:x:1001:1001:User B:/home/user_B:/bin/bash<br>
                        ftpuser:x:1002:1002:FTP User:/home/ftp:/bin/bash<br>
                        guest:x:1003:1003:Guest Account:/tmp:/bin/bash<br>
                    </div>
                `, 'error');
                displayedFiles = (virtualFiles[currentDirectory] || []).filter(file => file.name.includes(firstFindArgument));
                renderFileList(displayedFiles);
            } else if (injectedCommand.startsWith('echo "<h1>Hacked by Attacker!</h1>" > /var/www/html/index.html')) {
                showStatus(`
                    <strong><span style="color: red;">緊急事態！</span> Webサーバーが改ざんされました！</strong><br>
                    公開Webサイトのトップページが書き換えられました。<br>
                    これはWebアプリケーションとOSコマンドの連携における重大な脆弱性を示します。
                `, 'error');
                fileListContainer.innerHTML = `
                    <div style="text-align: center; padding: 50px; background-color: #222; color: #0f0; font-family: 'Courier New', monospace;">
                        <pre>
                        ███████ ███████  ██████ ██   ██ ███████
                        ██      ██      ██    ██ ██  ██  ██
                        ███████ ███████ ██    ██ █████   ███████
                             ██      ██ ██    ██ ██  ██  ██
                        ███████ ███████  ██████  ██   ██ ███████
                        </pre>
                        <h1 style="color: #0f0; font-size: 2.5em;">YOUR SITE HAS BEEN COMPROMISED!</h1>
                        <p style="color: #0f0; font-size: 1.2em;">All your data is vulnerable.</p>
                        <p style="color: #0f0; font-size: 0.9em;">(This is a simulation of a severe web server defacement.)</p>
                    </div>
                `;
                fileListContainer.classList.add('hacked-view');
                currentDirectoryDisplay.textContent = 'UNKNOWN (COMPROMISED)';
            } else if (injectedCommand.startsWith('chown ')) {
                const partsOfChown = injectedCommand.split(/\s+/);
                const newOwner = partsOfChown[1];
                const targetFile = partsOfChown[2];

                const fileToChange = virtualFiles[currentDirectory].find(f => f.name === targetFile);
                if (fileToChange) {
                    fileToChange.owner = newOwner;
                    saveAppState(); // 状態変更後に保存
                    renderFileList(displayedFiles);
                    showStatus(`
                        <strong><span style="color: red;">警告！</span> ファイルの所有者が変更されました！</strong><br>
                        ファイル <code>${targetFile}</code> の所有者が <code>${newOwner}</code> に変更されました。<br>
                        (find ${firstFindArgument} & <strong>chown ${newOwner} ${targetFile}</strong>)<br>
                        これは、不適切な権限管理が招く重大な結果です。
                    `, 'warning');
                } else {
                    showStatus(`エラー: ファイル「${targetFile}」が見つかりませんでした。（現在のディレクトリ内）`, 'error');
                }
            } else if (injectedCommand.startsWith('chmod ')) {
                const partsOfChmod = injectedCommand.split(/\s+/);
                const newPermissionsOctal = partsOfChmod[1];
                const targetFile = partsOfChmod[2];

                const fileToChange = virtualFiles[currentDirectory].find(f => f.name === targetFile);
                if (fileToChange) {
                    fileToChange.permissions = convertOctalToSymbolic(newPermissionsOctal);
                    saveAppState(); // 状態変更後に保存
                    renderFileList(displayedFiles);
                    showStatus(`
                        <strong><span style="color: red;">警告！</span> ファイルのパーミッションが変更されました！</strong><br>
                        ファイル <code>${targetFile}</code> のパーミッションが <code>${newPermissionsOctal} (${fileToChange.permissions})</code> に変更されました。<br>
                        (find ${firstFindArgument} & <strong>chmod ${newPermissionsOctal} ${targetFile}</strong>)<br>
                        これにより、誰でもファイルにアクセスできる可能性があります。
                    `, 'warning');
                } else {
                    showStatus(`エラー: ファイル「${targetFile}」が見つかりませんでした。（現在のディレクトリ内）`, 'error');
                }
            } else {
                showStatus(`
                    不明なインジェクションコマンドを検出しました。<br>
                    <code>& ${injectedCommand}</code><br>
                    このシミュレーションでは、危険な操作はシミュレートされませんでした。
                `, 'info');
                displayedFiles = (virtualFiles[currentDirectory] || []).filter(file => file.name.includes(firstFindArgument));
                renderFileList(displayedFiles);
            }
        } else {
            displayedFiles = (virtualFiles[currentDirectory] || []).filter(file => file.name.includes(input));
            renderFileList(displayedFiles);
            showStatus(`「${input}」の検索結果を表示しました。`, 'success');
        }
    }

    // イベントリスナー (変更なし)
    searchButton.addEventListener('click', () => {
        performSearch(searchInput.value);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(searchInput.value);
        }
    });

    scenarioButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            statusArea.style.display = 'none';
            if (activeOverlay) {
                activeOverlay.classList.remove('active');
                activeOverlay.innerHTML = '';
                activeOverlay = null;
            }
            searchInput.value = e.target.dataset.input;
            showStatus('検索バーにコマンドが入力されました。「検索」ボタンを押して実行してください。', 'info');
        });
    });

    resetButton.addEventListener('click', resetApp);

    closeStatusButton.addEventListener('click', () => {
        statusArea.style.display = 'none';
    });

    // アプリケーション開始時の処理
    // --- ここから変更 ---
    if (!loadAppState()) { // localStorageからの読み込みを試みる
        resetApp(); // 失敗したら初期化
        showStatus('仮想ファイル管理システムへようこそ！検索バーにコマンドを入力して試してみてください。', 'info');
        setTimeout(() => statusArea.style.display = 'none', 3000); // 3秒後に消える
    } else {
        // 読み込み成功した場合は、現在のディレクトリとファイルリストを再レンダリング
        currentDirectoryDisplay.textContent = currentDirectory;
        displayedFiles = [...virtualFiles[currentDirectory]];
        renderFileList(displayedFiles);
        showStatus('前回の状態を読み込みました。', 'info');
        setTimeout(() => statusArea.style.display = 'none', 3000); // 3秒後に消える
    }
    // --- ここまで変更 ---
});