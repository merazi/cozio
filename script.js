/**
 * Global State Management
 * task structure: { id: 1, text: "Task 1", completed: false, dueDate: "YYYY-MM-DD" }
 * todoLists structure: { "List Name": [task, ...] }
 */
let todoLists = JSON.parse(localStorage.getItem('todoLists')) || { 'Main': [] };
// currentListName is only used when manipulating lists, not for view control anymore.
let currentListName = localStorage.getItem('currentListName') || 'Main';

// --- DOM Elements ---
const kanbanBoard = document.getElementById('kanban-board');
const addListBtn = document.getElementById('add-list-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const dropboxSyncBtn = document.getElementById('dropbox-sync-btn');
const driveSyncBtn = document.getElementById('drive-sync-btn'); // Repurposed for Sign Out
// REMOVED: const listSelector = document.getElementById('list-select'); 

// NEW: Login/Auth Elements
const appWrapper = document.getElementById('app-wrapper'); 
const loginScreen = document.getElementById('login-screen');
const emailInput = document.getElementById('email-input');
const sendLinkBtn = document.getElementById('send-link-btn');
const emailSentMessage = document.getElementById('email-sent-message');
const emailConfirmSection = document.getElementById('email-confirm-section');
const confirmEmailInput = document.getElementById('confirm-email-input');
const finishLoginBtn = document.getElementById('finish-login-btn');
const authErrorMessage = document.getElementById('auth-error-message');
const syncStatus = document.getElementById('sync-status');


// --- Firebase Configuration ---
// <<< CRITICAL: REPLACE ALL OF THESE WITH YOUR ACTUAL CONFIG FROM FIREBASE CONSOLE >>>
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkR3Y5b4YymPJdX48eggk9q6st06rh1t8",
  authDomain: "cozio-2607f.firebaseapp.com",
  databaseURL: "https://cozio-2607f-default-rtdb.firebaseio.com",
  projectId: "cozio-2607f",
  storageBucket: "cozio-2607f.firebasestorage.app",
  messagingSenderId: "283476380138",
  appId: "1:283476380138:web:7e84ee31b0345e0630ca93",
  measurementId: "G-YKN7LSDDLN"
};

// Action code settings for the email link
// This URL must match your authorized domain in Firebase Console.
const ACTION_CODE_SETTINGS = {
  url: window.location.href, // Use the current page URL as the destination after verification
  handleCodeInApp: true,
};

let firebaseApp = null;
let database = null;
let auth = null; 
let currentUser = null; 

// --- Utility Functions ---

/**
 * Saves the current state of all lists to LocalStorage AND to Firebase.
 * All functions that modify todoLists MUST call this.
 */
function saveState() {
    localStorage.setItem('todoLists', JSON.stringify(todoLists));
    localStorage.setItem('currentListName', currentListName); 
    
    // Attempt to synchronize with Firebase if connected
    syncStateToFirebase();
}

/**
 * Helper function to safely get the first list name.
 */
function getFirstListName() {
    const listNames = Object.keys(todoLists);
    return listNames.length > 0 ? listNames[0] : 'Main';
}

/**
 * Formats a date string (YYYY-MM-DD) into a readable format.
 */
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString + 'T00:00:00'); 
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        today.setHours(0, 0, 0, 0);
        tomorrow.setHours(0, 0, 0, 0);

        const taskDate = new Date(date);
        taskDate.setHours(0, 0, 0, 0);

        if (taskDate.getTime() === today.getTime()) {
            return 'Today';
        } else if (taskDate.getTime() === tomorrow.getTime()) {
            return 'Tomorrow';
        } else if (date.getFullYear() === new Date().getFullYear()) {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            return date.toLocaleDateString('en-US');
        }
    } catch (e) {
        return dateString; 
    }
}

/**
 * Checks if a date is in the past (overdue).
 */
function isOverdue(dateString) {
    if (!dateString) return false;
    const taskDate = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    
    return taskDate.getTime() < today.getTime();
}


// --- List Management ---

/**
 * Toggles the visibility of a list action dropdown.
 */
function toggleDropdown(listName) {
    document.querySelectorAll('.list-actions-content').forEach(content => {
        if (content.closest('.list-column').dataset.listName !== listName) {
            content.style.display = 'none';
        }
    });
    const dropdown = document.querySelector(`.list-column[data-list-name="${listName}"] .list-actions-content`);
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
}

/**
 * Handles the creation of a new list.
 */
function addNewList() {
    const newListName = prompt('Enter a name for the new task list:');
    if (newListName && newListName.trim() !== '') {
        const trimmedName = newListName.trim();
        if (!todoLists[trimmedName]) {
            todoLists[trimmedName] = [];
            currentListName = trimmedName; 
            saveState(); // Calls syncStateToFirebase
            renderKanbanBoard();
        } else {
            alert('A list with that name already exists!');
        }
    }
}

/**
 * Handles renaming a list.
 */
function renameList(oldName) {
    const newName = prompt(`Rename list "${oldName}" to:`, oldName);

    if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
        const trimmedNewName = newName.trim();
        if (todoLists[trimmedNewName]) {
            alert('A list with that new name already exists!');
            return;
        }

        const tasks = todoLists[oldName];
        delete todoLists[oldName];
        todoLists[trimmedNewName] = tasks;
        
        if (currentListName === oldName) {
            currentListName = trimmedNewName;
        }

        saveState(); // Calls syncStateToFirebase
        renderKanbanBoard();
    }
}

/**
 * Handles deleting a list.
 */
function deleteList(listToDelete) {
    if (Object.keys(todoLists).length === 1) {
        alert('Cannot delete the only remaining list. Create another list first.');
        return;
    }

    if (confirm(`Are you sure you want to delete the list "${listToDelete}"? This action cannot be undone.`)) {
        delete todoLists[listToDelete];

        if (currentListName === listToDelete) {
            currentListName = getFirstListName();
        }
        
        saveState(); // Calls syncStateToFirebase
        renderKanbanBoard();
    }
}


// --- Task Management ---

/**
 * Renders the tasks for a specific list, using the enhanced sorting logic.
 * @param {string} listName 
 * @param {HTMLElement} container 
 */
function renderListTasks(listName, container) {
    container.innerHTML = '';
    
    // --- ENHANCED SORTING LOGIC ---
    const sortedList = (todoLists[listName] || []).sort((a, b) => {
        // 1. Completed tasks always go to the bottom.
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }

        // --- All remaining tasks are incomplete ---

        const aHasDate = !!a.dueDate;
        const bHasDate = !!b.dueDate;

        // 2. Tasks with dates are prioritized over tasks without dates.
        if (aHasDate !== bHasDate) {
            return aHasDate ? -1 : 1;
        }

        // 3. If both have dates, sort by date (sooner first).
        if (aHasDate && bHasDate) {
            const dateA = new Date(a.dueDate);
            const dateB = new Date(b.dueDate);
            return dateA.getTime() - dateB.getTime();
        }

        // 4. If neither has a date (aHasDate == bHasDate == false), sort by ID (creation order).
        return a.id - b.id;
    });
    // --- END ENHANCED SORTING LOGIC ---


    if (sortedList.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: #aaa; padding: 20px;">No tasks here!</p>`;
        return;
    }

    sortedList.forEach(task => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `todo-item ${task.completed ? 'completed' : ''}`;
        itemDiv.dataset.id = task.id;

        const overdue = !task.completed && isOverdue(task.dueDate);

        itemDiv.innerHTML = `
            <div class="todo-item-top">
                <span class="todo-item-text">${task.text}</span>
                <div class="todo-item-actions">
                    <button class="edit-btn" title="Edit Task" data-list-name="${listName}">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="toggle-btn" title="Toggle Completion" data-list-name="${listName}">
                        <i class="fas ${task.completed ? 'fa-undo' : 'fa-check'}"></i>
                    </button>
                    <button class="delete-btn" title="Delete Task" data-list-name="${listName}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${task.dueDate ? `
                <div class="task-metadata">
                    <span class="due-date-display ${overdue ? 'overdue' : ''}" data-list-name="${listName}" data-task-id="${task.id}" title="Click to change due date">
                        <i class="fas fa-calendar-alt"></i> ${formatDate(task.dueDate)} <i class="fas fa-pencil-alt"></i>
                    </span>
                </div>
            ` : `
                <div class="task-metadata">
                    <span class="due-date-display no-date" data-list-name="${listName}" data-task-id="${task.id}" title="Click to set due date">
                        <i class="fas fa-calendar-alt"></i> Set due date <i class="fas fa-plus"></i>
                    </span>
                </div>
            `}
        `;
        
        container.appendChild(itemDiv);
    });
}

/**
 * Renders the entire Kanban board with all lists.
 */
function renderKanbanBoard() {
    kanbanBoard.innerHTML = ''; 
    const listNames = Object.keys(todoLists);

    // Ensure the current list exists
    if (!todoLists[currentListName]) {
        currentListName = getFirstListName();
    }
    
    // 2. Render all list columns
    listNames.forEach(listName => {
        const column = document.createElement('div');
        column.className = 'list-column';
        column.dataset.listName = listName;
        
        const header = document.createElement('div');
        header.className = 'list-header';
        
        // List Header 
        header.innerHTML = `
            <span class="list-name-text">${listName}</span>
            <div class="list-actions-dropdown">
                <button class="dropdown-toggle" data-list-name="${listName}" title="List Actions">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="list-actions-content">
                    <button class="action-rename" data-list-name="${listName}">Rename list</button>
                    <button class="action-delete" data-list-name="${listName}">Delete list</button>
                </div>
            </div>
        `;
        
        // Task Input Form 
        const taskInputForm = document.createElement('div');
        taskInputForm.className = 'task-add-form';
        taskInputForm.innerHTML = `
            <input type="text" placeholder="Task description..." data-list-name="${listName}" class="task-input-field">
            <input type="date" data-list-name="${listName}" class="due-date-input">
            <button class="task-add-btn" data-list-name="${listName}" title="Add Task">
                <i class="fas fa-plus"></i>
            </button>
        `;
        
        const listContainer = document.createElement('div');
        listContainer.className = 'todo-list-inner';
        listContainer.id = `list-${listName.replace(/\s/g, '-')}`;

        column.appendChild(header);
        column.appendChild(taskInputForm); 
        column.appendChild(listContainer);
        kanbanBoard.appendChild(column);

        // Render tasks for this new column
        renderListTasks(listName, listContainer);
    });
    
    document.addEventListener('click', closeAllDropdowns);
}


/**
 * Adds a new task to the specified list.
 */
function addTask(listName, textInput, dateInput) {
    const taskText = textInput.value.trim();
    const dueDate = dateInput.value;
    
    if (taskText === '') return;

    const currentList = todoLists[listName];
    // Simple ID generation
    const newId = currentList.length > 0 ? Math.max(...currentList.map(t => t.id)) + 1 : 1;

    currentList.push({
        id: newId,
        text: taskText,
        completed: false,
        dueDate: dueDate || null 
    });

    textInput.value = '';
    dateInput.value = ''; 
    saveState(); // Calls syncStateToFirebase
    
    const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
    if (container) {
        renderListTasks(listName, container);
    }
}

/**
 * Starts the editing process for a task description.
 */
function editTask(itemDiv, taskTextElement, taskId, listName) {
    const currentTask = todoLists[listName].find(t => t.id === taskId);
    if (!currentTask) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTask.text;
    input.className = 'edit-task-input';
    
    itemDiv.querySelector('.todo-item-top').replaceChild(input, taskTextElement);
    input.focus();

    const saveEdit = () => {
        const newText = input.value.trim();
        if (newText) {
            currentTask.text = newText;
            saveState(); // Calls syncStateToFirebase
        }
        input.removeEventListener('blur', saveEdit);
        input.removeEventListener('keypress', handleKeydown);
        
        const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
        if (container) renderListTasks(listName, container);
    };
    
    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            saveEdit(); 
        }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', handleKeydown);
}

/**
 * Handles inline date editing for an existing task.
 */
function editDueDate(target) {
    const listName = target.dataset.listName;
    const taskId = parseInt(target.dataset.taskId);
    const itemDiv = target.closest('.todo-item');
    const currentTask = todoLists[listName].find(t => t.id === taskId);
    if (!currentTask) return;

    const currentDisplay = itemDiv.querySelector('.due-date-display');
    const input = document.createElement('input');
    input.type = 'date';
    input.value = currentTask.dueDate || '';
    input.className = 'edit-task-input'; 

    const tempWrapper = document.createElement('div');
    tempWrapper.appendChild(input);
    
    itemDiv.querySelector('.task-metadata').replaceChild(tempWrapper, currentDisplay);
    input.focus();

    const saveDate = () => {
        const newDate = input.value;
        currentTask.dueDate = newDate || null;
        saveState(); // Calls syncStateToFirebase
        
        input.removeEventListener('change', saveDate);
        input.removeEventListener('blur', saveDate);
        
        const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
        if (container) renderListTasks(listName, container);
    };
    
    input.addEventListener('change', saveDate);
    input.addEventListener('blur', saveDate);
}


/**
 * Handles all task and list actions.
 */
function handleBoardClick(event) {
    const target = event.target.closest('button, .list-name-text, .due-date-display');
    if (!target) return;

    // --- Task Creation ---
    if (target.classList.contains('task-add-btn')) {
        const listName = target.dataset.listName;
        const form = target.closest('.task-add-form');
        const textInput = form.querySelector('.task-input-field');
        const dateInput = form.querySelector('.due-date-input');
        addTask(listName, textInput, dateInput);
        textInput.focus();
        return;
    }
    
    // --- Task Due Date Editing ---
    if (target.classList.contains('due-date-display')) {
        editDueDate(target);
        return;
    }

    // --- Task Actions (Toggle, Delete, Edit) ---
    if (target.closest('.todo-item')) {
        const itemDiv = target.closest('.todo-item');
        const taskTextElement = itemDiv.querySelector('.todo-item-text');
        const taskId = parseInt(itemDiv.dataset.id);
        const listName = target.dataset.listName;

        let currentList = todoLists[listName];
        const taskIndex = currentList.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        if (target.classList.contains('toggle-btn')) {
            currentList[taskIndex].completed = !currentList[taskIndex].completed;
            saveState(); // Calls syncStateToFirebase
        } else if (target.classList.contains('delete-btn')) {
            currentList.splice(taskIndex, 1);
            saveState(); // Calls syncStateToFirebase
        } else if (target.classList.contains('edit-btn')) {
            editTask(itemDiv, taskTextElement, taskId, listName);
            return; 
        }
        
        const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
        if (container) renderListTasks(listName, container);

    // --- List Actions (Dropdown, Rename, Delete) ---
    } else if (target.classList.contains('dropdown-toggle')) {
        const listName = target.dataset.listName;
        toggleDropdown(listName);
    } else if (target.classList.contains('action-rename')) {
        const listName = target.dataset.listName;
        renameList(listName);
    } else if (target.classList.contains('action-delete')) {
        const listName = target.dataset.listName;
        deleteList(listName);
    } 
}

/**
 * Handle Enter key press on the inline text input fields.
 */
function handleInputKeypress(event) {
    const target = event.target;
    if (target.classList.contains('task-input-field') && event.key === 'Enter') {
        event.preventDefault(); 
        const listName = target.dataset.listName;
        const form = target.closest('.task-add-form');
        const dateInput = form.querySelector('.due-date-input');
        addTask(listName, target, dateInput);
        target.focus();
    }
}


/**
 * Closes all list action dropdowns if the click is outside.
 */
function closeAllDropdowns(event) {
    if (!event.target.closest('.list-actions-dropdown')) {
        document.querySelectorAll('.list-actions-content').forEach(content => {
            content.style.display = 'none';
        });
    }
}


// --- Theme Toggling ---

/**
 * Toggles between light and dark themes.
 */
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const icon = themeToggleBtn.querySelector('i');
    icon.classList.toggle('fa-sun', newTheme === 'light');
    icon.classList.toggle('fa-moon', newTheme === 'dark');
}

/**
 * Initializes the theme based on user preference or local storage.
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

    document.documentElement.setAttribute('data-theme', initialTheme);

    const icon = themeToggleBtn.querySelector('i');
    icon.classList.add(initialTheme === 'light' ? 'fa-sun' : 'fa-moon');
}

/**
 * Updates the footer status text.
 */
function updateFooterStatus(message) {
    if (syncStatus) {
        syncStatus.textContent = message;
    }
}


// --- Firebase Synchronization Logic ---

/**
 * Writes the local todoLists state to the Firebase Realtime Database.
 */
function syncStateToFirebase() {
    // Guard: Only sync if authenticated
    if (!currentUser || !database) {
        updateFooterStatus('Status: Not logged in. Cannot sync.');
        return;
    }
    
    // The data path is /users/{uid}/data
    const dataRef = database.ref('users/' + currentUser.uid + '/data');
    dataRef.set(todoLists)
        .then(() => {
            console.log("Firebase sync successful.");
            updateFooterStatus('Status: Synced with cloud.');
        })
        .catch(error => {
            console.error("Firebase sync error:", error);
            updateFooterStatus('Status: Sync Error.');
        });
}

/**
 * Sets up a listener for real-time changes from Firebase.
 */
function listenForFirebaseChanges() {
    // Guard: Only listen if authenticated
    if (!currentUser || !database) {
        return;
    }
    
    const dataRef = database.ref('users/' + currentUser.uid + '/data');
    
    // This 'value' listener triggers anytime data at the path changes.
    dataRef.on('value', (snapshot) => {
        const remoteData = snapshot.val();
        if (remoteData) {
            // Check if the remote data is newer/different
            const localDataString = JSON.stringify(todoLists);
            const remoteDataString = JSON.stringify(remoteData);

            if (localDataString !== remoteDataString) {
                console.log("Remote changes detected. Updating local state.");
                todoLists = remoteData;
                localStorage.setItem('todoLists', remoteDataString);
                renderKanbanBoard();
                updateFooterStatus('Status: Synced with cloud.');
            }
        } else {
            // If remote data is empty (first login), push the local state up.
            syncStateToFirebase();
        }
    }, (error) => {
        console.error("Firebase listener error:", error);
        updateFooterStatus('Status: Sync Error.');
    });
    
    // Update the Sync button to indicate Firebase connection
    dropboxSyncBtn.innerHTML = '<i class="fas fa-sync"></i> Sync'; // Simplified text/icon
    updateFooterStatus('Status: Synced with cloud.');
}


// --- Authentication Functions (Email Link Auth) ---

/**
 * Sends the magic link to the provided email address.
 */
function sendLoginLink() {
    const email = emailInput.value.trim();
    if (!email) {
        authErrorMessage.textContent = 'Please enter a valid email address.';
        return;
    }
    
    authErrorMessage.textContent = 'Sending link...';
    sendLinkBtn.disabled = true;

    auth.sendSignInLinkToEmail(email, ACTION_CODE_SETTINGS)
        .then(() => {
            // The link was successfully sent. Inform the user.
            window.localStorage.setItem('emailForSignIn', email);
            emailInput.style.display = 'none';
            sendLinkBtn.style.display = 'none';
            emailSentMessage.style.display = 'block';
            authErrorMessage.textContent = ''; // Clear status
        })
        .catch((error) => {
            console.error("Error sending sign-in link:", error);
            authErrorMessage.textContent = `Error: ${error.message}. Please check your email and try again.`;
            sendLinkBtn.disabled = false;
        });
}

/**
 * Handles sign-in when the user returns from clicking the email link.
 */
function handleEmailLinkSignIn() {
    // Check if the current URL is a sign-in link
    if (auth && auth.isSignInWithEmailLink(window.location.href)) {
        loginScreen.style.display = 'flex'; // Show the login box while processing

        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
            // The user may have opened the link on a different browser/device.
            // Prompt them to confirm the email.
            document.getElementById('login-title').textContent = 'Finalize Sign In';
            document.getElementById('login-instructions').textContent = 'Please confirm the email address used to receive the link.';

            emailInput.style.display = 'none';
            sendLinkBtn.style.display = 'none';
            emailSentMessage.style.display = 'none';
            emailConfirmSection.style.display = 'flex'; 
            
            // Attach listener for finishing the sign-in
            finishLoginBtn.addEventListener('click', () => {
                const confirmedEmail = confirmEmailInput.value.trim();
                if (confirmedEmail) {
                    processSignIn(confirmedEmail);
                } else {
                    authErrorMessage.textContent = 'Please enter your email to finalize login.';
                }
            }, { once: true }); 
            
            return; // Wait for user input
        }

        // We have the email, proceed with sign-in
        processSignIn(email);
    }
}

/**
 * Finalizes the sign-in using the email and the link data.
 */
function processSignIn(email) {
    authErrorMessage.textContent = 'Verifying link... Please wait.';
    finishLoginBtn.disabled = true;
    sendLinkBtn.disabled = true;
    
    auth.signInWithEmailLink(email, window.location.href)
        .then(() => {
            // Success! The user is now signed in.
            window.localStorage.removeItem('emailForSignIn');
            // Remove the link parameters from the URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // The onAuthStateChanged observer will handle the UI update
            resetLoginUI();
        })
        .catch((error) => {
            console.error("Error signing in with email link:", error);
            authErrorMessage.textContent = `Login failed: ${error.message}. Please try sending a new link.`;
            // Reset UI to initial state
            resetLoginUI();
        });
}

/**
 * Resets the login form UI to the initial 'Send Link' state.
 */
function resetLoginUI() {
    // Make sure all elements are in their default, pre-login state
    emailInput.style.display = 'block';
    sendLinkBtn.style.display = 'block';
    sendLinkBtn.disabled = false;
    emailSentMessage.style.display = 'none';
    emailConfirmSection.style.display = 'none';
    document.getElementById('login-title').textContent = 'Sign In to Cozio';
    document.getElementById('login-instructions').textContent = 'Enter your email address to receive a secure login link.';
    authErrorMessage.textContent = '';
    emailInput.value = '';
    confirmEmailInput.value = '';
}

/**
 * The primary synchronization function (now maps to Firebase init/check).
 */
function syncWithFirebase() {
    // If the user clicks sync, we simply ensure the local data is pushed up immediately.
    syncStateToFirebase();
}

/**
 * Repurposed for Sign Out.
 */
function syncWithDrive() {
    if (currentUser) {
        if (confirm('Are you sure you want to sign out?')) {
            firebase.auth().signOut().then(() => {
                // Sign-out successful. onAuthStateChanged handles UI.
                alert('Signed out successfully.');
            }).catch((error) => {
                console.error("Sign out error:", error);
                alert('An error occurred during sign out.');
            });
        }
    } else {
        alert('You are currently signed out.');
    }
}


// --- Firebase Initialization ---

/**
 * Initializes Firebase and sets up the authentication state observer.
 */
function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded.');
        updateFooterStatus('Status: Firebase SDK Missing.');
        return;
    }
    
    if (!firebaseApp) {
        firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        database = firebase.database();
        auth = firebase.auth();
    }
    
    // Check if the user is returning from the login link
    handleEmailLinkSignIn();

    // Auth State Observer: Controls app visibility and listens for data
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in.
            currentUser = user;
            console.log("User signed in:", currentUser.uid);
            
            // SHOW APP, HIDE LOGIN
            appWrapper.style.display = 'flex'; // Show the main application wrapper
            loginScreen.style.display = 'none'; // Hide the login screen
            
            // Start listening for user-specific data
            listenForFirebaseChanges();
            
            updateFooterStatus(`Logged in: ${user.email || 'via Email Link'}`);
            
        } else {
            // User is signed out.
            currentUser = null;
            console.log("User is signed out. Showing login screen.");

            // HIDE APP, SHOW LOGIN
            appWrapper.style.display = 'none'; // Hide the main application board
            // Only show login screen if we are not actively handling a redirect
            if (!auth.isSignInWithEmailLink(window.location.href)) {
                 loginScreen.style.display = 'flex'; 
            }
           
            updateFooterStatus('Signed out. Please log in.');
        }
    });
}

// --- Initialization and Event Listeners ---

function initApp() {
    // 1. Initialize Theme
    initTheme();
    
    // 2. Initialize Firebase (Sets up auth listener which controls app access)
    initFirebase();
    
    // 3. Render Initial State (The auth listener will control when it's displayed)
    renderKanbanBoard(); 

    // 4. Attach Event Listeners
    addListBtn.addEventListener('click', addNewList);
    kanbanBoard.addEventListener('click', handleBoardClick);
    kanbanBoard.addEventListener('keypress', handleInputKeypress); 
    
    themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Attach Auth Event Listeners
    sendLinkBtn.addEventListener('click', sendLoginLink);
    
    // Repurposed Sync Buttons
    dropboxSyncBtn.addEventListener('click', syncWithFirebase); 
    driveSyncBtn.addEventListener('click', syncWithDrive); // Repurposed for Sign Out

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.list-actions-dropdown')) {
            document.querySelectorAll('.list-actions-content').forEach(content => {
                content.style.display = 'none';
            });
        }
    });

    // Handle resize events (no more mobile view logic inside, just re-render)
    window.addEventListener('resize', () => renderKanbanBoard());
}

// Start the application
initApp();