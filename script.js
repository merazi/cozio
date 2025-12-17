/**
 * Global State Management
 * task structure: { id: 1, text: "Task 1", completed: false, dueDate: "YYYY-MM-DD" }
 * todoLists structure: { "List Name": [task, ...] }
 */
let todoLists = JSON.parse(localStorage.getItem('todoLists')) || { 'Main': [] };
let currentListName = localStorage.getItem('currentListName') || 'Main';

// --- DOM Elements ---
const kanbanBoard = document.getElementById('kanban-board');
const addListBtn = document.getElementById('add-list-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const dropboxSyncBtn = document.getElementById('dropbox-sync-btn');
const driveSyncBtn = document.getElementById('drive-sync-btn');

// --- Utility Functions ---

/**
 * Saves the current state of all lists to LocalStorage.
 */
function saveState() {
    localStorage.setItem('todoLists', JSON.stringify(todoLists));
    localStorage.setItem('currentListName', currentListName); 
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
        const date = new Date(dateString + 'T00:00:00'); // Add T00:00:00 to prevent timezone issues
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Normalize dates to midnight for comparison
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
        return dateString; // Return raw string if formatting fails
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
    
    // An uncompleted task is overdue if its date is strictly before today's date
    return taskDate.getTime() < today.getTime();
}


// --- List Management (Unchanged) ---

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
            saveState();
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

        saveState();
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
        
        saveState();
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
 * Renders the entire Kanban board with all lists. (Unchanged)
 */
function renderKanbanBoard() {
    kanbanBoard.innerHTML = ''; 

    Object.keys(todoLists).forEach(listName => {
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
 * Adds a new task to the specified list. (Unchanged)
 */
function addTask(listName, textInput, dateInput) {
    const taskText = textInput.value.trim();
    const dueDate = dateInput.value;
    
    if (taskText === '') return;

    const currentList = todoLists[listName];
    // Note: The task ID implicitly determines creation order (lower ID is older)
    const newId = currentList.length > 0 ? Math.max(...currentList.map(t => t.id)) + 1 : 1;

    currentList.push({
        id: newId,
        text: taskText,
        completed: false,
        dueDate: dueDate || null // Store as null if empty
    });

    textInput.value = '';
    dateInput.value = ''; 
    saveState();
    
    const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
    if (container) {
        renderListTasks(listName, container);
    }
}

/**
 * Starts the editing process for a task description. (Unchanged)
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
            saveState();
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
 * Handles inline date editing for an existing task. (Unchanged)
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
        saveState();
        
        input.removeEventListener('change', saveDate);
        input.removeEventListener('blur', saveDate);
        
        const container = document.getElementById(`list-${listName.replace(/\s/g, '-')}`);
        if (container) renderListTasks(listName, container);
    };
    
    input.addEventListener('change', saveDate);
    input.addEventListener('blur', saveDate);
}


/**
 * Handles all task and list actions. (Unchanged)
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
            saveState();
        } else if (target.classList.contains('delete-btn')) {
            currentList.splice(taskIndex, 1);
            saveState();
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
 * Handle Enter key press on the inline text input fields. (Unchanged)
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
 * Closes all list action dropdowns if the click is outside. (Unchanged)
 */
function closeAllDropdowns(event) {
    if (!event.target.closest('.list-actions-dropdown')) {
        document.querySelectorAll('.list-actions-content').forEach(content => {
            content.style.display = 'none';
        });
    }
}


// --- Theme Toggling (Unchanged) ---

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

// --- Cloud Sync Placeholders (Unchanged) ---

/**
 * Placeholder for Dropbox Sync Logic.
 */
function syncWithDropbox() {
    alert('Dropbox sync started (Placeholder).');
}

/**
 * Placeholder for Google Drive Sync Logic.
 */
function syncWithDrive() {
    alert('Google Drive sync started (Placeholder).');
}

// --- Initialization and Event Listeners ---

function initApp() {
    // 1. Initialize Theme
    initTheme();

    // 2. Render Initial State
    renderKanbanBoard();

    // 3. Attach Event Listeners
    addListBtn.addEventListener('click', addNewList);
    kanbanBoard.addEventListener('click', handleBoardClick);
    kanbanBoard.addEventListener('keypress', handleInputKeypress); 
    
    themeToggleBtn.addEventListener('click', toggleTheme);
    dropboxSyncBtn.addEventListener('click', syncWithDropbox);
    driveSyncBtn.addEventListener('click', syncWithDrive);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.list-actions-dropdown')) {
            document.querySelectorAll('.list-actions-content').forEach(content => {
                content.style.display = 'none';
            });
        }
    });
}

// Start the application
initApp();