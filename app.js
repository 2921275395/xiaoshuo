const { createApp, ref, computed, onMounted, watch, reactive } = Vue;

createApp({
    setup() {
        // Data
        const novels = ref([]);
        const folders = ref([]);
        
        // Config & Keys
        const zhipuKey = ref('');
        const openaiKey = ref('');
        const apiProvider = ref('zhipu');
        const apiUrl = ref('');
        const apiModel = ref('glm-4v'); 
        const modelList = ref([]);
        const bgColor = ref('#8EC5FC');
        const bgImage = ref('');
        
        // UI State
        const showSettings = ref(false);
        const showDetail = ref(false);
        const showFilteredView = ref(false);
        const showFabMenu = ref(false);
        const showActionSheet = ref(false);
        const showCropper = ref(false);
        const isLoading = ref(false);
        
        // Modal States
        const showAddModal = ref(false);
        const addFormMode = ref('add');
        const addFormType = ref('novel');
        const addForm = reactive({ id: null, title: '', author: '', platform: '' });
        
        const showConfirmModal = ref(false);
        const confirmMessage = ref('');
        let confirmCallback = null;

        const showModelPicker = ref(false);
        const showProviderPicker = ref(false);

        const toastVisible = ref(false);
        const toastMsg = ref('');

        // Selection & Move
        const isSelectionMode = ref(false);
        const selectedItems = ref([]);
        const showMoveModal = ref(false);
        const moveTargetId = ref(null);
        
        // Navigation & Selection Items
        const currentFolder = ref(null);
        const activeNovel = ref(null);
        const filteredList = ref([]);
        const filterTitle = ref('');
        const searchQuery = ref('');
        const selectedItem = ref(null);
        const selectedType = ref('');
        
        // Cropper State
        const tempBgSrc = ref('');
        const cropImg = ref(null);
        const cropArea = ref(null);
        const cropBox = reactive({ x: 0, y: 0, w: 0, h: 0 });
        let cropStartTouches = []; 
        let cropStartBox = {}; 
        let cropStartDist = 0;
        let touchStartX = 0;

        // Init
        onMounted(() => {
            const n = localStorage.getItem('rf_novels_v3');
            const f = localStorage.getItem('rf_folders_v3');
            const c = localStorage.getItem('rf_config_v3');
            if(n) novels.value = JSON.parse(n);
            if(f) folders.value = JSON.parse(f);
            if(c) {
                const cfg = JSON.parse(c);
                zhipuKey.value = cfg.zhipuKey || '';
                openaiKey.value = cfg.openaiKey || '';
                // Fallback for old single key
                if(!zhipuKey.value && !openaiKey.value && cfg.apiKey) {
                    if(cfg.apiProvider === 'zhipu') zhipuKey.value = cfg.apiKey;
                    else openaiKey.value = cfg.apiKey;
                }
                
                bgColor.value = cfg.bgColor || '#8EC5FC'; 
                bgImage.value = cfg.bgImage || '';
                apiProvider.value = cfg.apiProvider || 'zhipu';
                apiUrl.value = cfg.apiUrl || '';
                apiModel.value = cfg.apiModel || (apiProvider.value === 'zhipu' ? 'glm-4v' : 'gpt-4o');
            }
            updateBg();
        });

        // Watchers
        watch([novels, folders], () => {
            localStorage.setItem('rf_novels_v3', JSON.stringify(novels.value));
            localStorage.setItem('rf_folders_v3', JSON.stringify(folders.value));
        }, { deep: true });

        watch([zhipuKey, openaiKey, bgColor, bgImage, apiProvider, apiUrl, apiModel], () => {
            localStorage.setItem('rf_config_v3', JSON.stringify({
                zhipuKey: zhipuKey.value, openaiKey: openaiKey.value,
                bgColor: bgColor.value, bgImage: bgImage.value,
                apiProvider: apiProvider.value, apiUrl: apiUrl.value, apiModel: apiModel.value
            }));
            updateBg();
        });
        
        watch(apiProvider, (newVal) => {
            if (newVal === 'zhipu') {
                apiModel.value = 'glm-4v';
            } else {
                if (apiModel.value === 'glm-4v') apiModel.value = 'gpt-4o';
            }
        });

        const updateBg = () => {
            document.body.style.backgroundImage = bgImage.value ? `url('${bgImage.value}')` : 'none';
            document.body.style.backgroundColor = bgImage.value ? 'transparent' : bgColor.value;
        };

        // Helpers
        const showToast = (msg) => {
            toastMsg.value = msg; toastVisible.value = true;
            setTimeout(() => toastVisible.value = false, 2500);
        };
        const openConfirm = (msg, cb) => {
            confirmMessage.value = msg; confirmCallback = cb; showConfirmModal.value = true;
            showActionSheet.value = false;
        };
        const closeConfirm = () => showConfirmModal.value = false;
        const executeConfirm = () => { if(confirmCallback) confirmCallback(); closeConfirm(); };

        // Computed
        const currentKey = computed(() => apiProvider.value === 'zhipu' ? zhipuKey.value : openaiKey.value);
        const currentItems = computed(() => [...currentFoldersList.value, ...currentNovelsList.value]);
        const currentFoldersList = computed(() => folders.value.filter(f => (f.parentId || null) === (currentFolder.value ? currentFolder.value.id : null)));
        const currentNovelsList = computed(() => novels.value.filter(n => n.folderId === (currentFolder.value ? currentFolder.value.id : null)));
        const novelsByPlatform = computed(() => {
            const map = {};
            novels.value.forEach(n => {
                const p = n.platform || '其他';
                if(!map[p]) map[p] = [];
                map[p].push(n);
            });
            return map;
        });

        // Navigation Actions
        const enterFolder = (f) => currentFolder.value = f;
        const goBackFolder = () => {
            if(!currentFolder.value) return;
            const parentId = currentFolder.value.parentId;
            currentFolder.value = parentId ? folders.value.find(f => f.id === parentId) : null;
        };
        
        // Detail & Reading Dates
        const openDetail = (n) => {
            // Migrate single date to array
            if (!n.readDates) {
                n.readDates = n.readDate ? [n.readDate] : [];
            }
            activeNovel.value = n; showDetail.value = true;
        };
        const addReadDate = () => {
            if (activeNovel.value) {
                const today = new Date().toISOString().split('T')[0];
                activeNovel.value.readDates.push(today);
            }
        };
        const removeReadDate = (idx) => {
            if (activeNovel.value) {
                activeNovel.value.readDates.splice(idx, 1);
            }
        };
        const closeDetail = () => { showDetail.value = false; activeNovel.value = null; };

        // Author Filter
        const filterByAuthor = (author) => {
            if(!author) return;
            const res = novels.value.filter(n => n.author === author);
            openFilteredView(`作者: ${author}`, res);
        };

        // Add / Edit
        const openAddModal = (type) => {
            addFormMode.value = 'add';
            addFormType.value = type === 'manual' ? 'novel' : 'folder';
            addForm.title = ''; addForm.author = ''; addForm.platform = '';
            showFabMenu.value = false; showAddModal.value = true;
        };
        const closeAddModal = () => showAddModal.value = false;
        const confirmAddOrEdit = () => {
            if(!addForm.title.trim()) { showToast("请输入名称"); return; }
            if(addFormMode.value === 'add') {
                if(addFormType.value === 'folder') {
                    folders.value.push({ id: Date.now(), name: addForm.title, parentId: currentFolder.value ? currentFolder.value.id : null });
                } else {
                    novels.value.unshift({
                        id: Date.now(), title: addForm.title, author: addForm.author||'佚名', platform: addForm.platform||'',
                        folderId: currentFolder.value ? currentFolder.value.id : null, createTime: new Date().toISOString(), readDates: []
                    });
                }
            } else {
                const target = selectedItem.value;
                if(selectedType.value === 'folder') target.name = addForm.title;
                else { target.title = addForm.title; target.author = addForm.author; target.platform = addForm.platform; }
            }
            closeAddModal();
        };
        const openEditModalFromSheet = () => {
            addFormMode.value = 'edit'; addFormType.value = 'novel';
            addForm.title = selectedItem.value.title; addForm.author = selectedItem.value.author; addForm.platform = selectedItem.value.platform;
            showActionSheet.value = false; showAddModal.value = true;
        };
        const openRenameFromSheet = () => {
            addFormMode.value = 'edit'; addFormType.value = 'folder';
            addForm.title = selectedItem.value.name;
            showActionSheet.value = false; showAddModal.value = true;
        };

        // Selection
        const enterSelectionModeFromSheet = () => {
            showActionSheet.value = false; isSelectionMode.value = true;
            selectedItems.value = [selectedType.value === 'novel' ? `n-${selectedItem.value.id}` : `f-${selectedItem.value.id}`];
        };
        const exitSelectionMode = () => { isSelectionMode.value = false; selectedItems.value = []; };
        const isSelected = (id, type) => selectedItems.value.includes(`${type === 'novel' ? 'n' : 'f'}-${id}`);
        const handleCardClick = (item, type) => {
            if (isSelectionMode.value) {
                const key = `${type==='novel'?'n':'f'}-${item.id}`;
                if (selectedItems.value.includes(key)) selectedItems.value = selectedItems.value.filter(k => k !== key);
                else selectedItems.value.push(key);
            } else { if(type === 'novel') openDetail(item); else enterFolder(item); }
        };

        // Move
        const openMoveModal = () => {
            if(selectedItems.value.length === 0) return;
            moveTargetId.value = null; showMoveModal.value = true;
        };
        const closeMoveModal = () => showMoveModal.value = false;
        const moveCurrentSubfolders = computed(() => folders.value.filter(f => (f.parentId || null) === moveTargetId.value));
        const movePath = computed(() => {
            let path = []; let curr = folders.value.find(f => f.id === moveTargetId.value);
            while(curr) { path.unshift(curr); curr = folders.value.find(f => f.id === curr.parentId); }
            return path;
        });
        const enterMoveFolder = (f) => moveTargetId.value = f.id;
        const moveNavTo = (f) => moveTargetId.value = f ? f.id : null;
        const confirmMove = () => {
            selectedItems.value.forEach(key => {
                const type = key.startsWith('n') ? 'novel' : 'folder';
                const id = parseInt(key.split('-')[1]);
                if(type === 'novel') { const n = novels.value.find(x => x.id === id); if(n) n.folderId = moveTargetId.value; }
                else {
                    const f = folders.value.find(x => x.id === id);
                    if(f && f.id !== moveTargetId.value) { 
                         let invalid = false; let check = moveTargetId.value;
                         while(check) { if(check === f.id) invalid = true; const p = folders.value.find(x => x.id === check); check = p ? p.parentId : null; }
                         if(!invalid) f.parentId = moveTargetId.value;
                    }
                }
            });
            closeMoveModal(); exitSelectionMode(); showToast("移动完成");
        };

        // --- API & Custom Select ---
        const openModelPicker = () => {
            if(modelList.value.length === 0) showToast("请先点击【链接 / 刷新模型】");
            showModelPicker.value = true;
        };
        const selectModel = (id) => {
            apiModel.value = id;
            showModelPicker.value = false;
        };

        const fetchModels = async () => {
            if(!currentKey.value) { showToast("请先填写 API Key"); return; }
            isLoading.value = true;
            modelList.value = [];
            
            try {
                let url;
                let headers = { 'Authorization': `Bearer ${currentKey.value}` };
                
                if(apiProvider.value === 'zhipu') {
                    url = 'https://open.bigmodel.cn/api/paas/v4/models'; 
                } else {
                    let base = apiUrl.value || 'https://api.openai.com/v1';
                    if(base.endsWith('/')) base = base.slice(0, -1);
                    if(base.endsWith('/chat/completions')) base = base.replace('/chat/completions', '');
                    url = `${base}/models`;
                }

                const res = await fetch(url, { method: 'GET', headers });
                const text = await res.text();
                if (!text || text.trim() === '') throw new Error("API 返回了空内容");

                let data;
                try { data = JSON.parse(text); } catch(e) { throw new Error(`非 JSON 响应: ${text.substring(0, 80)}...`); }
                
                if(data.error) throw new Error(data.error.message || JSON.stringify(data.error));
                
                if(Array.isArray(data.data)) {
                    modelList.value = data.data.sort((a,b) => {
                        const aV = a.id.includes('vision') || a.id.includes('4v');
                        const bV = b.id.includes('vision') || b.id.includes('4v');
                        return bV - aV;
                    });
                    if(modelList.value.length > 0) {
                        if(!apiModel.value) apiModel.value = modelList.value[0].id;
                        showToast(`获取成功，共 ${modelList.value.length} 个模型`);
                        showModelPicker.value = true;
                    } else throw new Error("模型列表为空");
                } else throw new Error("格式错误: data不是数组");
            } catch(e) {
                showToast("连接失败: " + e.message);
            } finally {
                isLoading.value = false;
            }
        };

        const handleAiUpload = async(e) => {
            const f = e.target.files[0]; if(!f) return;
            if(!currentKey.value) { showToast("请设置 API Key"); return; }
            isLoading.value = true; showFabMenu.value = false;
            
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = async() => {
                const base64Img = reader.result.split(',')[1];
                let url, headers, body;
                const model = (apiProvider.value === 'zhipu') ? 'glm-4v' : (apiModel.value || 'gpt-4o');
                
                try {
                    if (apiProvider.value === 'zhipu') {
                        url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
                        headers = {'Content-Type':'application/json','Authorization':`Bearer ${currentKey.value}`};
                        body = {
                            model: model,
                            messages: [{role:"user", content:[{type:"text", text:"提取书名,作者,平台(如起点). JSON only:{\"title\":\"\",\"author\":\"\",\"platform\":\"\"}"}, {type:"image_url", image_url:{url:base64Img}}]}]
                        };
                    } else {
                        let base = apiUrl.value || 'https://api.openai.com/v1';
                        if(base.endsWith('/')) base = base.slice(0,-1);
                        url = `${base}/chat/completions`;
                        headers = {'Content-Type':'application/json','Authorization':`Bearer ${currentKey.value}`};
                        body = {
                            model: model, max_tokens: 300,
                            messages: [{role:"user", content:[{type:"text", text:"Extract title, author, platform. JSON only."}, {type:"image_url", image_url:{url:`data:image/jpeg;base64,${base64Img}`}}]}]
                        };
                    }

                    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
                    const text = await res.text();
                    if (!text || text.trim() === '') throw new Error("API 返回空内容");
                    
                    let d;
                    try { d = JSON.parse(text); } 
                    catch(e) { throw new Error(`API 响应非 JSON: ${text.substring(0,60)}...`); }
                    
                    if(d.error) throw new Error(d.error.message || JSON.stringify(d.error));
                    if(!d.choices || !d.choices[0]) throw new Error("API 未返回 choices");

                    const content = d.choices[0].message.content;
                    // --- Improved Regex for JSON extraction ---
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    
                    if(!jsonMatch) throw new Error("AI未返回有效JSON格式");
                    
                    const newNovel = JSON.parse(jsonMatch[0]);
                    
                    novels.value.unshift({ id: Date.now(), ...newNovel, folderId: currentFolder.value ? currentFolder.value.id : null, createTime: new Date().toISOString(), readDates: [] });
                    showToast("识别成功");
                } catch(err) { 
                    showToast("识别失败: " + err.message);
                    console.error(err);
                }
                isLoading.value = false; e.target.value = '';
            };
        };

        // --- Gestures & Swipe ---
        const handleTouchStart = (e) => touchStartX = e.changedTouches[0].screenX;
        const handleMainTouchEnd = (e) => {
            if (isSelectionMode.value) return; 
            const diff = e.changedTouches[0].screenX - touchStartX;
            if(diff > 80 && currentFolder.value) goBackFolder();
            else if (diff < -80) showSettings.value = true;
        };
        const handleSettingsTouchEnd = (e) => { if(e.changedTouches[0].screenX - touchStartX > 80) showSettings.value = false; };
        const handleGenericSwipeBack = (e, cb) => { if(e.changedTouches[0].screenX - touchStartX > 80) cb(); };

        let lpTimer;
        const startLongPress = (item, type) => {
            if(isSelectionMode.value) return;
            lpTimer = setTimeout(() => { selectedItem.value = item; selectedType.value = type; showActionSheet.value = true; if(navigator.vibrate) navigator.vibrate(50); }, 600);
        };
        const cancelLongPress = () => clearTimeout(lpTimer);
        const closeActionSheet = () => showActionSheet.value = false;
        
        const deleteItem = () => {
            const id = selectedItem.value.id;
            if(selectedType.value === 'novel') novels.value = novels.value.filter(n => n.id !== id);
            else {
                const delRec = (fid) => {
                    novels.value = novels.value.filter(n => n.folderId !== fid);
                    folders.value.filter(f => f.parentId === fid).forEach(c => delRec(c.id));
                    folders.value = folders.value.filter(f => f.id !== fid);
                };
                delRec(id);
            }
            showActionSheet.value = false;
            showToast("已删除");
        };

        // --- Cropper (Fixed Logic) ---
        const triggerBgUpload = () => document.getElementById('bgInput').click();
        const handleBgSelect = (e) => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = (ev) => { tempBgSrc.value = ev.target.result; showCropper.value = true; };
            r.readAsDataURL(f); e.target.value = '';
        };
        const initCropBox = () => {
            const img = cropImg.value; if(!img) return;
            const imgRect = img.getBoundingClientRect();
            const screenRatio = window.innerWidth / window.innerHeight;
            let w = imgRect.width * 0.8; let h = w / screenRatio;
            if (h > imgRect.height * 0.9) { h = imgRect.height * 0.9; w = h * screenRatio; }
            const areaRect = cropArea.value.getBoundingClientRect();
            cropBox.w = w; cropBox.h = h;
            cropBox.x = (imgRect.left - areaRect.left) + (imgRect.width - w)/2;
            cropBox.y = (imgRect.top - areaRect.top) + (imgRect.height - h)/2;
        };
        const cropBoxStyle = computed(() => ({ left: cropBox.x + 'px', top: cropBox.y + 'px', width: cropBox.w + 'px', height: cropBox.h + 'px' }));
        
        const cropTouchStart = (e) => {
            cropStartTouches = Array.from(e.touches).map(t => ({x: t.clientX, y: t.clientY})); // Use clientX/Y
            cropStartBox = { ...cropBox };
            if (e.touches.length === 2) {
                cropStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX, 
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        };

        const cropTouchMove = (e) => {
            if (!showCropper.value) return;
            if (e.cancelable) e.preventDefault();
            
            const imgRect = cropImg.value.getBoundingClientRect();
            const areaRect = cropArea.value.getBoundingClientRect();
            
            // Bounds relative to the area container
            const minX = imgRect.left - areaRect.left; 
            const maxX = minX + imgRect.width;
            const minY = imgRect.top - areaRect.top; 
            const maxY = minY + imgRect.height;

            if (e.touches.length === 1 && cropStartTouches.length >= 1) {
                const dx = e.touches[0].clientX - cropStartTouches[0].x;
                const dy = e.touches[0].clientY - cropStartTouches[0].y;
                let nx = cropStartBox.x + dx; 
                let ny = cropStartBox.y + dy;

                // Clamp
                if (nx < minX) nx = minX;
                if (ny < minY) ny = minY;
                if (nx + cropBox.w > maxX) nx = maxX - cropBox.w;
                if (ny + cropBox.h > maxY) ny = maxY - cropBox.h;
                
                cropBox.x = nx; cropBox.y = ny;

            } else if (e.touches.length === 2 && cropStartTouches.length >= 2) {
                const curDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX, 
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scale = curDist / (cropStartDist || 1);
                
                let nw = cropStartBox.w * scale;
                let nh = nw / (window.innerWidth / window.innerHeight);

                // Max/Min Size Constraints
                if (nw > 50 && nw <= imgRect.width && nh <= imgRect.height) {
                     // Center zoom
                    const dx = (nw - cropStartBox.w) / 2;
                    const dy = (nh - cropStartBox.h) / 2;
                    let nx = cropStartBox.x - dx;
                    let ny = cropStartBox.y - dy;

                    // Bound checks for zoom
                    if(nx >= minX && ny >= minY && nx+nw <= maxX && ny+nh <= maxY) {
                         cropBox.w = nw; cropBox.h = nh; cropBox.x = nx; cropBox.y = ny;
                    }
                }
            }
        };

        const confirmCrop = () => {
            try {
                const cvs = document.createElement('canvas'); const ctx = cvs.getContext('2d');
                // Use screen resolution
                const dpr = window.devicePixelRatio || 2; 
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;
                cvs.width = screenW * dpr; 
                cvs.height = screenH * dpr;
                
                const img = cropImg.value; 
                const imgRect = img.getBoundingClientRect(); 
                const areaRect = cropArea.value.getBoundingClientRect();
                
                // Coordinates of crop box relative to image
                // Box Absolute X - Image Absolute X = Relative X
                // (areaRect.left + cropBox.x) - imgRect.left
                const relX = (areaRect.left + cropBox.x) - imgRect.left;
                const relY = (areaRect.top + cropBox.y) - imgRect.top;
                
                // Scale factor (Natural Size / Displayed Size)
                const scaleX = img.naturalWidth / imgRect.width;
                const scaleY = img.naturalHeight / imgRect.height;

                ctx.drawImage(
                    img, 
                    relX * scaleX, relY * scaleY, 
                    cropBox.w * scaleX, cropBox.h * scaleY, 
                    0, 0, 
                    cvs.width, cvs.height
                );
                
                bgImage.value = cvs.toDataURL('image/png'); 
                showCropper.value = false;
            } catch(e) {
                console.error(e);
                showToast("裁剪出错");
            }
        };

        // Other Actions
        const exportData = () => {
            const b = new Blob([JSON.stringify({novels:novels.value, folders:folders.value, config:{zhipuKey:zhipuKey.value, openaiKey:openaiKey.value, bgColor:bgColor.value,apiProvider:apiProvider.value,apiUrl:apiUrl.value,apiModel:apiModel.value}})], {type:'application/json'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'backup.json'; a.click();
        };
        const triggerImport = () => document.getElementById('importInput').click();
        const handleImportData = (e) => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = (ev) => {
                const d = JSON.parse(ev.target.result);
                novels.value = d.novels||[]; folders.value = d.folders||[];
                if(d.config) { 
                    zhipuKey.value = d.config.zhipuKey || d.config.apiKey || ''; // Compat
                    openaiKey.value = d.config.openaiKey || '';
                    bgColor.value=d.config.bgColor; 
                    apiProvider.value=d.config.apiProvider||'zhipu'; 
                    apiUrl.value=d.config.apiUrl||''; 
                    apiModel.value=d.config.apiModel||''; 
                }
                showToast("导入成功");
            };
            r.readAsText(f);
        };
        const clearData = () => { localStorage.clear(); location.reload(); };
        const removeBg = () => { bgImage.value = ''; };
        const formatDate = (iso) => iso ? iso.split('T')[0] : '';
        const openFilteredView = (title, list) => { filterTitle.value = title; filteredList.value = list; showFilteredView.value = true; showSettings.value = false; };
        const closeFilteredView = () => showFilteredView.value = false;
        const performSearch = () => {
            if(!searchQuery.value.trim()) return;
            const q = searchQuery.value.toLowerCase();
            const res = novels.value.filter(n => n.title.toLowerCase().includes(q) || n.author.toLowerCase().includes(q) || (n.platform && n.platform.toLowerCase().includes(q)));
            openFilteredView(`搜索: ${searchQuery.value}`, res); searchQuery.value = '';
        };

        return {
            novels, folders, zhipuKey, openaiKey, bgColor, bgImage, apiProvider, apiUrl, apiModel, searchQuery, modelList,
            showSettings, showDetail, showFilteredView, showFabMenu, showActionSheet, showCropper, isLoading,
            showAddModal, addFormMode, addFormType, addForm, showConfirmModal, confirmMessage, toastVisible, toastMsg,
            isSelectionMode, selectedItems, showMoveModal, moveTargetId, movePath, moveCurrentSubfolders,
            currentFolder, currentItems, currentFoldersList, currentNovelsList, activeNovel, filteredList, filterTitle, novelsByPlatform,
            selectedItem, selectedType, tempBgSrc, cropImg, cropArea, cropBox, cropBoxStyle, showModelPicker, showProviderPicker,
            openDetail, closeDetail, formatDate, enterFolder, openFilteredView, closeFilteredView, performSearch, filterByAuthor,
            openAddModal, closeAddModal, confirmAddOrEdit, openEditModalFromSheet, openRenameFromSheet,
            enterSelectionModeFromSheet, exitSelectionMode, isSelected, handleCardClick,
            openMoveModal, closeMoveModal, enterMoveFolder, moveNavTo, confirmMove,
            openConfirm, closeConfirm, executeConfirm, showToast, openModelPicker, selectModel,
            handleTouchStart, handleMainTouchEnd, handleSettingsTouchEnd, handleGenericSwipeBack,
            startLongPress, cancelLongPress, closeActionSheet, deleteItem, addReadDate, removeReadDate,
            triggerBgUpload, handleBgSelect, removeBg, initCropBox, cropTouchStart, cropTouchMove, confirmCrop, 
            exportData, triggerImport, handleImportData, clearData, handleAiUpload, fetchModels
        };
    }
}).mount('#app');
