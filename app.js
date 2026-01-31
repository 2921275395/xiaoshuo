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
        const sortMode = ref('update'); // 'update' or 'create'
        
        // UI State
        const showSettings = ref(false);
        const showDetail = ref(false);
        const showFilteredView = ref(false);
        const showFabMenu = ref(false);
        const showActionSheet = ref(false);
        const showCropper = ref(false);
        const showSortModal = ref(false);
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
        let activeHandle = null; 
        let startTouch = { x: 0, y: 0 };
        let startBox = { x: 0, y: 0, w: 0, h: 0 };
        let touchStartX = 0;
        let mainLongPressTimer;

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
                if(!zhipuKey.value && !openaiKey.value && cfg.apiKey) {
                    if(cfg.apiProvider === 'zhipu') zhipuKey.value = cfg.apiKey;
                    else openaiKey.value = cfg.apiKey;
                }
                bgColor.value = cfg.bgColor || '#8EC5FC'; 
                bgImage.value = cfg.bgImage || '';
                apiProvider.value = cfg.apiProvider || 'zhipu';
                apiUrl.value = cfg.apiUrl || '';
                apiModel.value = cfg.apiModel || (apiProvider.value === 'zhipu' ? 'glm-4v' : 'gpt-4o');
                sortMode.value = cfg.sortMode || 'update';
            }
            updateBg();
        });

        // Watchers
        watch([novels, folders], () => {
            localStorage.setItem('rf_novels_v3', JSON.stringify(novels.value));
            localStorage.setItem('rf_folders_v3', JSON.stringify(folders.value));
        }, { deep: true });

        watch([zhipuKey, openaiKey, bgColor, bgImage, apiProvider, apiUrl, apiModel, sortMode], () => {
            localStorage.setItem('rf_config_v3', JSON.stringify({
                zhipuKey: zhipuKey.value, openaiKey: openaiKey.value,
                bgColor: bgColor.value, bgImage: bgImage.value,
                apiProvider: apiProvider.value, apiUrl: apiUrl.value, apiModel: apiModel.value,
                sortMode: sortMode.value
            }));
            updateBg();
        });
        
        watch(apiProvider, (newVal) => {
            if (newVal === 'zhipu') apiModel.value = 'glm-4v';
            else if (apiModel.value === 'glm-4v') apiModel.value = 'gpt-4o';
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
        const touchUpdate = () => { if(activeNovel.value) activeNovel.value.updateTime = new Date().toISOString(); };

        // Computed
        const currentKey = computed(() => apiProvider.value === 'zhipu' ? zhipuKey.value : openaiKey.value);
        const currentItems = computed(() => [...currentFoldersList.value, ...currentNovelsList.value]);
        
        const currentFoldersList = computed(() => folders.value.filter(f => (f.parentId || null) === (currentFolder.value ? currentFolder.value.id : null)));
        
        const currentNovelsList = computed(() => {
            const list = novels.value.filter(n => n.folderId === (currentFolder.value ? currentFolder.value.id : null));
            return list.sort((a, b) => {
                if (sortMode.value === 'update') {
                    // Fallback to createTime if updateTime is missing
                    const tA = a.updateTime || a.createTime;
                    const tB = b.updateTime || b.createTime;
                    return new Date(tB) - new Date(tA);
                } else {
                    return new Date(b.createTime) - new Date(a.createTime);
                }
            });
        });

        const novelsByPlatform = computed(() => {
            const map = {};
            novels.value.forEach(n => {
                const p = n.platform || '其他';
                if(!map[p]) map[p] = [];
                map[p].push(n);
            });
            return map;
        });

        // Sorting
        const changeSortMode = (mode) => {
            sortMode.value = mode;
            showSortModal.value = false;
            showToast(mode === 'update' ? '已按修改时间排序' : '已按创建时间排序');
        };

        // Navigation
        const enterFolder = (f) => currentFolder.value = f;
        const goBackFolder = () => {
            if(!currentFolder.value) return;
            const parentId = currentFolder.value.parentId;
            currentFolder.value = parentId ? folders.value.find(f => f.id === parentId) : null;
        };
        
        // Detail
        const openDetail = (n) => {
            if (!n.readDates) n.readDates = n.readDate ? [n.readDate] : [];
            // Update time when viewing? No, only when editing.
            activeNovel.value = n; showDetail.value = true;
        };
        const addReadDate = () => {
            if (activeNovel.value) {
                const today = new Date().toISOString().split('T')[0];
                activeNovel.value.readDates.push(today);
                activeNovel.value.updateTime = new Date().toISOString();
            }
        };
        const startDateLongPress = (idx) => {
            lpTimer = setTimeout(() => {
                openConfirm('删除这条阅读记录？', () => {
                   if(activeNovel.value) {
                       activeNovel.value.readDates.splice(idx, 1);
                       activeNovel.value.updateTime = new Date().toISOString();
                   }
                });
                if(navigator.vibrate) navigator.vibrate(50);
            }, 600);
        };
        const closeDetail = () => { showDetail.value = false; activeNovel.value = null; };

        // Filter
        const filterByAuthor = (author) => {
            if(!author) return;
            const res = novels.value.filter(n => n.author === author);
            showDetail.value = false; 
            openFilteredView(`作者: ${author}`, res);
        };

        // Add/Edit
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
                        folderId: currentFolder.value ? currentFolder.value.id : null, 
                        createTime: new Date().toISOString(), updateTime: new Date().toISOString(), readDates: []
                    });
                }
            } else {
                const target = selectedItem.value;
                if(selectedType.value === 'folder') target.name = addForm.title;
                else { 
                    target.title = addForm.title; target.author = addForm.author; target.platform = addForm.platform; 
                    target.updateTime = new Date().toISOString();
                }
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

        // Move logic ... (unchanged core, just linked)
        const openMoveModal = () => { if(selectedItems.value.length === 0) return; moveTargetId.value = null; showMoveModal.value = true; };
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
                if(type === 'novel') { const n = novels.value.find(x => x.id === id); if(n) { n.folderId = moveTargetId.value; n.updateTime = new Date().toISOString(); } }
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

        // API
        const openModelPicker = () => { if(modelList.value.length === 0) showToast("请先点击【链接 / 刷新模型】"); showModelPicker.value = true; };
        const selectModel = (id) => { apiModel.value = id; showModelPicker.value = false; };
        const fetchModels = async () => {
            if(!currentKey.value) { showToast("请先填写 API Key"); return; }
            isLoading.value = true; modelList.value = [];
            try {
                let url, headers = { 'Authorization': `Bearer ${currentKey.value}` };
                if(apiProvider.value === 'zhipu') url = 'https://open.bigmodel.cn/api/paas/v4/models'; 
                else {
                    let base = apiUrl.value || 'https://api.openai.com/v1';
                    if(base.endsWith('/')) base = base.slice(0, -1);
                    if(base.endsWith('/chat/completions')) base = base.replace('/chat/completions', '');
                    url = `${base}/models`;
                }
                const res = await fetch(url, { method: 'GET', headers });
                const data = await res.json();
                if(data.error) throw new Error(data.error.message);
                if(Array.isArray(data.data)) {
                    modelList.value = data.data.sort((a,b) => (b.id.includes('4v')||b.id.includes('vision')) - (a.id.includes('4v')||a.id.includes('vision')));
                    if(modelList.value.length) { if(!apiModel.value) apiModel.value = modelList.value[0].id; showToast(`共 ${modelList.value.length} 个模型`); showModelPicker.value = true; }
                }
            } catch(e) { showToast("失败: " + e.message); } finally { isLoading.value = false; }
        };

        const handleAiUpload = async(e) => {
            const f = e.target.files[0]; if(!f) return;
            if(!currentKey.value) { showToast("请设置 API Key"); return; }
            isLoading.value = true; showFabMenu.value = false;
            
            const reader = new FileReader();
            reader.readAsDataURL(f);
            reader.onload = async() => {
                const base64Img = reader.result; // Keep full data URI
                const base64Data = base64Img.split(',')[1];
                let url, headers, body;
                const model = (apiProvider.value === 'zhipu') ? 'glm-4v' : (apiModel.value || 'gpt-4o');
                
                // Extremely strict prompt
                const prompt = "Extract book title, author, platform. JSON: {\"title\":\"\",\"author\":\"\",\"platform\":\"\"}. No markdown.";
                
                try {
                    if (apiProvider.value === 'zhipu') {
                        url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
                        headers = {'Content-Type':'application/json','Authorization':`Bearer ${currentKey.value}`};
                        body = {
                            model: model,
                            messages: [{role:"user", content:[{type:"text", text: prompt}, {type:"image_url", image_url:{url:base64Data}}]}]
                        };
                    } else {
                        let base = apiUrl.value || 'https://api.openai.com/v1';
                        if(base.endsWith('/')) base = base.slice(0,-1);
                        url = `${base}/chat/completions`;
                        headers = {'Content-Type':'application/json','Authorization':`Bearer ${currentKey.value}`};
                        body = {
                            model: model, max_tokens: 1000,
                            messages: [{role:"user", content:[{type:"text", text: prompt}, {type:"image_url", image_url:{url:base64Img}}]}]
                        };
                    }

                    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
                    const text = await res.text();
                    
                    let d;
                    try { d = JSON.parse(text); } 
                    catch(e) { console.log(text); throw new Error("API 返回了非 JSON 数据，请检查控制台"); }
                    
                    if(d.error) throw new Error(d.error.message || JSON.stringify(d.error));
                    if(!d.choices || !d.choices[0]) throw new Error("API 未返回有效内容");

                    const content = d.choices[0].message.content;
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    
                    if(!jsonMatch) throw new Error("模型未返回 JSON，请重试或更换模型");
                    
                    const newNovel = JSON.parse(jsonMatch[0]);
                    
                    novels.value.unshift({ 
                        id: Date.now(), ...newNovel, 
                        folderId: currentFolder.value ? currentFolder.value.id : null, 
                        createTime: new Date().toISOString(), updateTime: new Date().toISOString(), readDates: [] 
                    });
                    showToast("识别成功");
                } catch(err) { 
                    showToast("识别失败: " + err.message);
                }
                isLoading.value = false; e.target.value = '';
            };
        };

        // Interactions
        const handleMainTouchStart = (e) => { 
            touchStartX = e.changedTouches[0].screenX;
            if(!isSelectionMode.value) {
                mainLongPressTimer = setTimeout(() => {
                    showSortModal.value = true;
                    if(navigator.vibrate) navigator.vibrate(50);
                }, 800); // 800ms for background long press
            }
        };
        const handleMainTouchEnd = (e) => {
            clearTimeout(mainLongPressTimer);
            if (isSelectionMode.value) return; 
            const diff = e.changedTouches[0].screenX - touchStartX;
            if(diff > 80 && currentFolder.value) goBackFolder();
            else if (diff < -80) showSettings.value = true;
        };
        const handleSettingsTouchStart = (e) => touchStartX = e.changedTouches[0].screenX;
        const handleSettingsTouchEnd = (e) => { if(e.changedTouches[0].screenX - touchStartX > 80) showSettings.value = false; };
        const handleGenericSwipeBack = (e, cb) => { if(e.changedTouches[0].screenX - touchStartX > 80) cb(); };

        let lpTimer;
        const startCardLongPress = (item, type) => {
            clearTimeout(mainLongPressTimer); // Cancel background timer
            if(isSelectionMode.value) return;
            lpTimer = setTimeout(() => { selectedItem.value = item; selectedType.value = type; showActionSheet.value = true; if(navigator.vibrate) navigator.vibrate(50); }, 600);
        };
        const cancelCardLongPress = () => clearTimeout(lpTimer);
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

        // Cropper Logic
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
            let w = imgRect.width * 0.8; let h = w * (window.innerHeight / window.innerWidth); 
            if(h > imgRect.height * 0.9) { h = imgRect.height * 0.9; w = h * (window.innerWidth/window.innerHeight); }
            const areaRect = cropArea.value.getBoundingClientRect();
            cropBox.w = w; cropBox.h = h;
            cropBox.x = (imgRect.left - areaRect.left) + (imgRect.width - w)/2;
            cropBox.y = (imgRect.top - areaRect.top) + (imgRect.height - h)/2;
        };
        const cropBoxStyle = computed(() => ({ left: cropBox.x + 'px', top: cropBox.y + 'px', width: cropBox.w + 'px', height: cropBox.h + 'px' }));

        const cropTouchStart = (e) => {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if(target.classList.contains('crop-handle')) activeHandle = target.dataset.handle;
            else if (target.classList.contains('crop-box') || target.closest('.crop-box')) activeHandle = 'move';
            else activeHandle = null;
            startTouch = { x: touch.clientX, y: touch.clientY };
            startBox = { ...cropBox };
        };

        const cropTouchMove = (e) => {
            if (!activeHandle) return;
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - startTouch.x;
            const dy = touch.clientY - startTouch.y;
            const imgRect = cropImg.value.getBoundingClientRect();
            const areaRect = cropArea.value.getBoundingClientRect();
            const minX = imgRect.left - areaRect.left; const maxX = minX + imgRect.width;
            const minY = imgRect.top - areaRect.top; const maxY = minY + imgRect.height;

            if (activeHandle === 'move') {
                let nx = startBox.x + dx; let ny = startBox.y + dy;
                if (nx < minX) nx = minX; if (ny < minY) ny = minY;
                if (nx + cropBox.w > maxX) nx = maxX - cropBox.w;
                if (ny + cropBox.h > maxY) ny = maxY - cropBox.h;
                cropBox.x = nx; cropBox.y = ny;
            } else {
                let nx = startBox.x, ny = startBox.y, nw = startBox.w, nh = startBox.h;
                if (activeHandle.includes('r')) nw = startBox.w + dx;
                if (activeHandle.includes('l')) { nw = startBox.w - dx; nx = startBox.x + dx; }
                if (activeHandle.includes('b')) nh = startBox.h + dy;
                if (activeHandle.includes('t')) { nh = startBox.h - dy; ny = startBox.y + dy; }
                if (nw < 50) nw = 50; if (nh < 50) nh = 50;
                if (nx >= minX && ny >= minY && nx + nw <= maxX && ny + nh <= maxY) {
                    cropBox.x = nx; cropBox.y = ny; cropBox.w = nw; cropBox.h = nh;
                }
            }
        };
        const cropTouchEnd = () => { activeHandle = null; };

        const confirmCrop = () => {
            const cvs = document.createElement('canvas'); const ctx = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 2; 
            cvs.width = window.innerWidth * dpr; cvs.height = window.innerHeight * dpr;
            const img = cropImg.value; const imgRect = img.getBoundingClientRect(); const areaRect = cropArea.value.getBoundingClientRect();
            const relX = (areaRect.left + cropBox.x) - imgRect.left;
            const relY = (areaRect.top + cropBox.y) - imgRect.top;
            const scaleX = img.naturalWidth / imgRect.width;
            const scaleY = img.naturalHeight / imgRect.height;
            ctx.drawImage(img, relX * scaleX, relY * scaleY, cropBox.w * scaleX, cropBox.h * scaleY, 0, 0, cvs.width, cvs.height);
            bgImage.value = cvs.toDataURL('image/png'); showCropper.value = false;
        };

        // Export/Import
        const exportData = () => {
            const b = new Blob([JSON.stringify({novels:novels.value, folders:folders.value, config:{zhipuKey:zhipuKey.value, openaiKey:openaiKey.value, bgColor:bgColor.value,apiProvider:apiProvider.value,apiUrl:apiUrl.value,apiModel:apiModel.value, sortMode:sortMode.value}})], {type:'application/json'});
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
                    zhipuKey.value = d.config.zhipuKey || d.config.apiKey || ''; 
                    openaiKey.value = d.config.openaiKey || '';
                    bgColor.value=d.config.bgColor; 
                    apiProvider.value=d.config.apiProvider||'zhipu'; 
                    apiUrl.value=d.config.apiUrl||''; 
                    apiModel.value=d.config.apiModel||''; 
                    sortMode.value=d.config.sortMode||'update';
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
            novels, folders, zhipuKey, openaiKey, bgColor, bgImage, apiProvider, apiUrl, apiModel, searchQuery, modelList, sortMode,
            showSettings, showDetail, showFilteredView, showFabMenu, showActionSheet, showCropper, showSortModal, isLoading,
            showAddModal, addFormMode, addFormType, addForm, showConfirmModal, confirmMessage, toastVisible, toastMsg,
            isSelectionMode, selectedItems, showMoveModal, moveTargetId, movePath, moveCurrentSubfolders,
            currentFolder, currentItems, currentFoldersList, currentNovelsList, activeNovel, filteredList, filterTitle, novelsByPlatform,
            selectedItem, selectedType, tempBgSrc, cropImg, cropArea, cropBox, cropBoxStyle, showModelPicker, showProviderPicker,
            openDetail, closeDetail, formatDate, enterFolder, openFilteredView, closeFilteredView, performSearch, filterByAuthor,
            openAddModal, closeAddModal, confirmAddOrEdit, openEditModalFromSheet, openRenameFromSheet,
            enterSelectionModeFromSheet, exitSelectionMode, isSelected, handleCardClick,
            openMoveModal, closeMoveModal, enterMoveFolder, moveNavTo, confirmMove,
            openConfirm, closeConfirm, executeConfirm, showToast, openModelPicker, selectModel,
            handleMainTouchStart, handleMainTouchEnd, handleSettingsTouchStart, handleSettingsTouchEnd, handleGenericSwipeBack,
            startCardLongPress, cancelCardLongPress, closeActionSheet, deleteItem, addReadDate, startDateLongPress, changeSortMode,
            triggerBgUpload, handleBgSelect, removeBg, initCropBox, cropTouchStart, cropTouchMove, cropTouchEnd, confirmCrop, 
            exportData, triggerImport, handleImportData, clearData, handleAiUpload, fetchModels
        };
    }
}).mount('#app');
