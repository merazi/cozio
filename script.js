/**
 * Global State Management
 * task structure: { id: 1, text: "Task 1", completed: false, dueDate: "YYYY-MM-DD" }
 * todoLists structure: { "List Name": [task, ...] }
 */
let todoLists = JSON.parse(localStorage.getItem('todoLists')) || { 'Main': [] };
// currentListName is only used when manipulating lists, not for view control anymore.
let currentListName = localStorage.getItem('currentListName') || 'Main';

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

let firebaseApp = null;
let database = null;
let auth = null; 
let currentUser = null; 

// --- DOM Elements ---
const kanbanBoard = document.getElementById('kanban-board');
const addListBtn = document.getElementById('add-list-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const dropboxSyncBtn = document.getElementById('dropbox-sync-btn');
const driveSyncBtn = document.getElementById('drive-sync-btn');

// NEW: Login/Auth Elements
const appWrapper = document.getElementById('app-wrapper'); 
const loginScreen = document.getElementById('login-screen');

// Registration Form Elements
const registerFormSection = document.getElementById('register-form-section');
const registerEmailInput = document.getElementById('register-email-input');
const registerPasswordInput = document.getElementById('register-password-input');
const registerConfirmPasswordInput = document.getElementById('register-confirm-password-input');
const registerBtn = document.getElementById('register-btn');
const registerErrorMessage = document.getElementById('register-error-message');
const switchToLoginLink = document.getElementById('switch-to-login-link');

// Login Form Elements
const loginFormSection = document.getElementById('login-form-section');
const loginEmailInput = document.getElementById('login-email-input');
const loginPasswordInput = document.getElementById('login-password-input');
const loginBtn = document.getElementById('login-btn');
const loginErrorMessage = document.getElementById('login-error-message');
const switchToRegisterLink = document.getElementById('switch-to-register-link');

// Email Verification Section
const emailVerificationSection = document.getElementById('email-verification-section');
const pendingEmailDisplay = document.getElementById('pending-email');
const resendVerificationBtn = document.getElementById('resend-verification-btn');
const verificationLogoutBtn = document.getElementById('verification-logout-btn');
const verificationErrorMessage = document.getElementById('verification-error-message');

const syncStatus = document.getElementById('sync-status');


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


// --- Authentication Functions (Email/Password Auth) ---

/**
 * Validates email format.
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Handles user registration with email and password.
 */
function registerUser() {
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;
    const confirmPassword = registerConfirmPasswordInput.value;
    
    registerErrorMessage.textContent = '';

    // Validation
    if (!email || !password || !confirmPassword) {
        registerErrorMessage.textContent = 'Please fill in all fields.';
        return;
    }

    if (!isValidEmail(email)) {
        registerErrorMessage.textContent = 'Please enter a valid email address.';
        return;
    }

    if (password.length < 6) {
        registerErrorMessage.textContent = 'Password must be at least 6 characters.';
        return;
    }

    if (password !== confirmPassword) {
        registerErrorMessage.textContent = 'Passwords do not match.';
        return;
    }

    registerBtn.disabled = true;
    registerErrorMessage.textContent = 'Creating account...';

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Account created successfully
            const user = userCredential.user;
            console.log("User registered:", user.uid);

            // Send verification email
            return user.sendEmailVerification();
        })
        .then(() => {
            // Verification email sent
            console.log("Verification email sent.");
            showEmailVerificationPending(email);
            registerErrorMessage.textContent = '';
        })
        .catch((error) => {
            console.error("Registration error:", error);
            registerErrorMessage.textContent = `Error: ${error.message}`;
            registerBtn.disabled = false;
        });
}

/**
 * Handles user login with email and password.
 */
function loginUser() {
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;
    
    loginErrorMessage.textContent = '';

    // Validation
    if (!email || !password) {
        loginErrorMessage.textContent = 'Please enter both email and password.';
        return;
    }

    loginBtn.disabled = true;
    loginErrorMessage.textContent = 'Signing in...';

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            // Sign-in successful. onAuthStateChanged will handle the rest.
            loginErrorMessage.textContent = '';
        })
        .catch((error) => {
            console.error("Login error:", error);
            
            // Provide user-friendly error messages
            if (error.code === 'auth/user-not-found') {
                loginErrorMessage.textContent = 'No account found with this email.';
            } else if (error.code === 'auth/wrong-password') {
                loginErrorMessage.textContent = 'Incorrect password.';
            } else {
                loginErrorMessage.textContent = `Error: ${error.message}`;
            }
            loginBtn.disabled = false;
        });
}

/**
 * Shows the email verification pending screen.
 */
function showEmailVerificationPending(email) {
    registerFormSection.style.display = 'none';
    loginFormSection.style.display = 'none';
    emailVerificationSection.style.display = 'block';
    pendingEmailDisplay.textContent = email;
    verificationErrorMessage.textContent = '';
    resendVerificationBtn.disabled = false;
}

/**
 * Resends the verification email to the current user.
 */
function resendVerificationEmail() {
    if (!currentUser) {
        verificationErrorMessage.textContent = 'No user found. Please try again.';
        return;
    }

    resendVerificationBtn.disabled = true;
    verificationErrorMessage.textContent = 'Sending verification email...';

    currentUser.sendEmailVerification()
        .then(() => {
            verificationErrorMessage.textContent = 'Verification email resent. Please check your inbox.';
            setTimeout(() => {
                resendVerificationBtn.disabled = false;
            }, 3000); // Allow resending after 3 seconds
        })
        .catch((error) => {
            console.error("Resend verification error:", error);
            verificationErrorMessage.textContent = `Error: ${error.message}`;
            resendVerificationBtn.disabled = false;
        });
}

/**
 * Logs out the current user.
 */
function logoutUser() {
    auth.signOut()
        .then(() => {
            console.log("User signed out.");
            resetLoginUI();
        })
        .catch((error) => {
            console.error("Sign out error:", error);
            alert('An error occurred during sign out.');
        });
}

/**
 * Resets the login UI to show the registration form.
 */
function resetLoginUI() {
    registerFormSection.style.display = 'block';
    loginFormSection.style.display = 'none';
    emailVerificationSection.style.display = 'none';
    
    registerEmailInput.value = '';
    registerPasswordInput.value = '';
    registerConfirmPasswordInput.value = '';
    registerErrorMessage.textContent = '';
    registerBtn.disabled = false;

    loginEmailInput.value = '';
    loginPasswordInput.value = '';
    loginErrorMessage.textContent = '';
    loginBtn.disabled = false;

    verificationErrorMessage.textContent = '';
}

/**
 * Switches between registration and login forms.
 */
function switchToLoginForm() {
    registerFormSection.style.display = 'none';
    loginFormSection.style.display = 'block';
    registerErrorMessage.textContent = '';
    loginErrorMessage.textContent = '';
}

function switchToRegisterForm() {
    registerFormSection.style.display = 'block';
    loginFormSection.style.display = 'none';
    registerErrorMessage.textContent = '';
    loginErrorMessage.textContent = '';
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

    // Auth State Observer: Controls app visibility based on user and email verification
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in
            currentUser = user;
            console.log("User signed in:", currentUser.uid);
            
            // Check if email is verified
            if (user.emailVerified) {
                // Email is verified - show the app
                appWrapper.style.display = 'flex';
                loginScreen.style.display = 'none';
                listenForFirebaseChanges();
                updateFooterStatus(`Logged in: ${user.email}`);
                renderKanbanBoard();
            } else {
                // Email is not verified - show verification pending screen
                appWrapper.style.display = 'none';
                loginScreen.style.display = 'flex';
                showEmailVerificationPending(user.email);
                updateFooterStatus('Email verification pending.');
            }
        } else {
            // User is signed out
            currentUser = null;
            console.log("User is signed out. Showing login screen.");
            
            appWrapper.style.display = 'none';
            loginScreen.style.display = 'flex';
            resetLoginUI();
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
    registerBtn.addEventListener('click', registerUser);
    loginBtn.addEventListener('click', loginUser);
    switchToLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchToLoginForm();
    });
    switchToRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchToRegisterForm();
    });
    resendVerificationBtn.addEventListener('click', resendVerificationEmail);
    verificationLogoutBtn.addEventListener('click', logoutUser);
    
    // Repurposed Sync Buttons
    dropboxSyncBtn.addEventListener('click', syncWithFirebase); 
    driveSyncBtn.addEventListener('click', syncWithDrive);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.list-actions-dropdown')) {
            document.querySelectorAll('.list-actions-content').forEach(content => {
                content.style.display = 'none';
            });
        }
    });

    window.addEventListener('resize', () => renderKanbanBoard());
}

// Start the application
initApp();