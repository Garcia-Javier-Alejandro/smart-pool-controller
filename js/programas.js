/**
 * ==================== Programas (Schedules) Module ====================
 * Manages up to 3 programs with day/mode/time configurations
 * 
 * Features:
 * - Create, edit, delete up to 3 scheduled programs
 * - Each program has 7-day schedule (enable/disable per day)
 * - Per-day configuration: mode (1=Cascada, 2=Eyectores), start/stop times
 * - Automatic execution: checks every 15 minutes and publishes MQTT commands
 * - Conflict resolution: slot priority (slot 0 > slot 1 > slot 2)
 * - Manual override: pauses programs until next day when user takes manual control
 */

const ProgramasModule = (() => {
  // ==================== Constants ====================
  const MAX_PROGRAMS = 3;                    // Maximum number of programs
  const EXECUTION_CHECK_INTERVAL = 15 * 60 * 1000; // Check programs every 15 minutes
  const STORAGE_KEY = 'poolPrograms';        // localStorage key for persistence
  const DAY_NAMES_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  const DAY_NAMES_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MODE_NAMES = { 1: 'Cascada', 2: 'Eyectores' };
  
  // ==================== Module State ====================
  // Program storage (max 3 programs)
  let programs = [null, null, null]; // Array of program objects
  
  // Current editing state
  let currentSlot = null; // Which slot is being edited (0, 1, or 2)
  let scheduleData = {}; // Temporary schedule data during creation
  
  // Execution state
  let executionTimer = null; // Interval for checking programs
  let currentlyExecuting = null; // Which program is currently running {slot, day, mode}
  let manualOverride = false; // True if user manually controlled during program
  let manualOverrideDate = null; // Date when manual override happened
  
  // ==================== DOM Elements Cache ====================
  // DOM elements
  let elements = {};

  // ==================== Initialization ====================
  
  /**
   * Initialize the Programas module
   * Sets up DOM references, event listeners, loads saved programs, and starts execution timer
   */
  function init() {
    try {
      cacheElements();
      setupEventListeners();
      loadPrograms();
      startExecutionTimer();
    } catch (error) {
      console.error('Error initializing ProgramasModule:', error);
    }
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    // Screens
    elements.programasScreen = document.getElementById('programas-screen');
    elements.createProgramScreen = document.getElementById('create-program-screen');
    
    // Header elements (from main app)
    elements.btnBack = document.getElementById('btn-back');
    elements.headerTitle = document.getElementById('header-title');
    elements.mainScreen = document.getElementById('main-screen');
    
    // Program slots
    for (let i = 1; i <= 3; i++) {
      elements[`btnCreateProgram${i}`] = document.getElementById(`btn-create-program-${i}`);
      elements[`programCard${i}`] = document.getElementById(`program-card-${i}`);
      elements[`programName${i}`] = document.getElementById(`program-name-${i}`);
      elements[`programSummary${i}`] = document.getElementById(`program-summary-${i}`);
      elements[`btnToggleProgram${i}`] = document.getElementById(`btn-toggle-program-${i}`);
      elements[`btnEditProgram${i}`] = document.getElementById(`btn-edit-program-${i}`);
      elements[`btnDeleteProgram${i}`] = document.getElementById(`btn-delete-program-${i}`);
    }
    
    // Create program screen elements
    elements.scheduleTableBody = document.getElementById('schedule-table-body');
    elements.btnCreateCancel = document.getElementById('btn-create-cancel');
    elements.btnCreateSave = document.getElementById('btn-create-save');
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Create program buttons
    for (let i = 1; i <= 3; i++) {
      if (elements[`btnCreateProgram${i}`]) {
        elements[`btnCreateProgram${i}`].addEventListener('click', () => {
          openCreateProgram(i - 1); // 0-indexed
        });
      }
      
      if (elements[`btnToggleProgram${i}`]) {
        elements[`btnToggleProgram${i}`].addEventListener('click', () => {
          toggleProgram(i - 1);
        });
      }
      
      if (elements[`btnEditProgram${i}`]) {
        elements[`btnEditProgram${i}`].addEventListener('click', () => {
          editProgram(i - 1);
        });
      }
      
      if (elements[`btnDeleteProgram${i}`]) {
        elements[`btnDeleteProgram${i}`].addEventListener('click', () => {
          deleteProgram(i - 1);
        });
      }
    }
    
    // Create program screen
    if (elements.btnCreateCancel) {
      elements.btnCreateCancel.addEventListener('click', hideCreateScreen);
    }
    if (elements.btnCreateSave) {
      elements.btnCreateSave.addEventListener('click', saveProgram);
    }
    
    // Schedule table interactions
    setupScheduleTable();
  }

  /**
   * Setup schedule table interactions (7-day weekly schedule)
   * Each row represents one day with:
   * - Day toggle: enable/disable the day
   * - Mode buttons: select Cascada (1) or Eyectores (2)
   * - Time inputs: start and stop times
   */
  function setupScheduleTable() {
    if (!elements.scheduleTableBody) {
      return;
    }
    
    const rows = elements.scheduleTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const day = row.getAttribute('data-day');
      const dayToggle = row.querySelector('.day-toggle');
      const modeBtns = row.querySelectorAll('.mode-btn');
      const startTime = row.querySelector('.start-time');
      const stopTime = row.querySelector('.stop-time');
      
      // Day toggle
      dayToggle.addEventListener('click', () => {
        const isActive = dayToggle.classList.contains('active');
        
        if (isActive) {
          // Deactivate
          dayToggle.classList.remove('active', 'bg-primary', 'text-white', 'border-primary');
          dayToggle.classList.add('text-slate-400');
          modeBtns.forEach(btn => btn.disabled = true);
          startTime.disabled = true;
          stopTime.disabled = true;
          
          // Remove from schedule data
          delete scheduleData[day];
        } else {
          // Activate
          dayToggle.classList.add('active', 'bg-primary', 'text-white', 'border-primary');
          dayToggle.classList.remove('text-slate-400');
          modeBtns.forEach(btn => btn.disabled = false);
          startTime.disabled = false;
          stopTime.disabled = false;
          
          // Initialize schedule data for this day
          scheduleData[day] = {
            mode: null,
            start: '',
            stop: ''
          };
        }
        
        validateForm();
      });
      
      // Mode buttons
      modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          
          // Remove active state from all mode buttons in this row
          modeBtns.forEach(b => {
            b.classList.remove('bg-primary', 'text-white', 'border-primary', 'active');
          });
          
          // Activate selected button
          btn.classList.add('bg-primary', 'text-white', 'border-primary', 'active');
          
          // Update schedule data
          if (scheduleData[day]) {
            scheduleData[day].mode = parseInt(mode);
          }
          
          validateForm();
        });
      });
      
      // Time inputs
      startTime.addEventListener('change', () => {
        if (scheduleData[day]) {
          scheduleData[day].start = startTime.value;
        }
        validateForm();
      });
      
      stopTime.addEventListener('change', () => {
        if (scheduleData[day]) {
          scheduleData[day].stop = stopTime.value;
        }
        validateForm();
      });
    });
  }

  // ==================== Form Management ====================
  
  /**
   * Validate the create program form
   * Requirements:
   * - At least one day must be enabled
   * - Each enabled day must have: mode selected, start time, stop time
   */
  function validateForm() {
    const hasAtLeastOneDay = Object.keys(scheduleData).length > 0;
    let allDaysComplete = true;
    
    for (const day in scheduleData) {
      const data = scheduleData[day];
      if (!data.mode || !data.start || !data.stop) {
        allDaysComplete = false;
        break;
      }
    }
    
    elements.btnCreateSave.disabled = !(hasAtLeastOneDay && allDaysComplete);
  }

  /**
   * Open create program screen for a specific slot
   * @param {number} slot - Program slot index (0, 1, or 2)
   */
  function openCreateProgram(slot) {
    currentSlot = slot;
    scheduleData = {};
    
    // Reset form
    resetCreateForm();
    
    // Show create screen
    elements.createProgramScreen.classList.remove('translate-x-full');
    elements.createProgramScreen.classList.add('translate-x-0');
    
    // Update header title (use <br> for two lines to prevent overlap)
    if (elements.headerTitle) {
      elements.headerTitle.innerHTML = 'Crear<br>Programa';
    }
  }

  /**
   * Reset the create program form to initial state
   * Deactivates all days, disables all controls, clears all values
   */
  function resetCreateForm() {
    const rows = elements.scheduleTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const dayToggle = row.querySelector('.day-toggle');
      const modeBtns = row.querySelectorAll('.mode-btn');
      const startTime = row.querySelector('.start-time');
      const stopTime = row.querySelector('.stop-time');
      
      // Deactivate day
      dayToggle.classList.remove('active', 'bg-primary', 'text-white', 'border-primary');
      dayToggle.classList.add('text-slate-400');
      
      // Deactivate mode buttons
      modeBtns.forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white', 'border-primary', 'active');
        btn.disabled = true;
      });
      
      // Reset time inputs
      startTime.value = '';
      startTime.disabled = true;
      stopTime.value = '';
      stopTime.disabled = true;
    });
    
    elements.btnCreateSave.disabled = true;
  }

  /**
   * Hide create program screen
   */
  function hideCreateScreen() {
    elements.createProgramScreen.classList.remove('translate-x-0');
    elements.createProgramScreen.classList.add('translate-x-full');
    currentSlot = null;
    
    // Restore header title to Programas
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Programas';
    }
  }

  // ==================== Program CRUD Operations ====================
  
  /**
   * Save program to current slot
   * Prompts for program name, creates/updates program object, saves to localStorage
   */
  function saveProgram() {
    const existingProgram = programs[currentSlot];
    
    // Prompt for program name (pre-fill if editing)
    const name = prompt('Nombre del programa:', existingProgram ? existingProgram.name : '');
    
    if (!name || name.trim() === '') {
      alert('Debes ingresar un nombre para el programa');
      return;
    }
    
    // Create/update program object
    const program = {
      name: name.trim(),
      enabled: existingProgram ? existingProgram.enabled : true,
      schedule: { ...scheduleData }
    };
    
    // Save to slot
    programs[currentSlot] = program;
    
    // Update UI
    updateProgramSlot(currentSlot);
    
    // Save to localStorage
    savePrograms();
    
    // Hide create screen
    hideCreateScreen();
    
    // Log
    if (window.LogModule) {
      const action = existingProgram ? 'actualizado' : 'creado';
      LogModule.append(`✅ Programa "${program.name}" ${action}`);
    }
  }

  /**
   * Update program slot display in the UI
   * Shows/hides create button, updates program card with name, summary, toggle state
   * @param {number} slot - Program slot index (0, 1, or 2)
   */
  function updateProgramSlot(slot) {
    const program = programs[slot];
    const index = slot + 1;
    
    if (program) {
      // Hide create button, show program card
      elements[`btnCreateProgram${index}`].classList.add('hidden');
      elements[`programCard${index}`].classList.remove('hidden');
      
      // Update name
      elements[`programName${index}`].textContent = program.name;
      
      // Update toggle button
      const toggleBtn = elements[`btnToggleProgram${index}`];
      const toggleIcon = toggleBtn.querySelector('.material-icons-round');
      
      if (program.enabled) {
        toggleBtn.classList.remove('bg-slate-400', 'hover:bg-slate-500');
        toggleBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        toggleIcon.textContent = 'toggle_on';
      } else {
        toggleBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        toggleBtn.classList.add('bg-slate-400', 'hover:bg-slate-500');
        toggleIcon.textContent = 'toggle_off';
      }
      
      // Update summary
      const days = Object.keys(program.schedule).map(d => {
        return DAY_NAMES_SHORT[parseInt(d)];
      }).join(', ');
      
      const modes = [...new Set(Object.values(program.schedule).map(s => s.mode))];
      const modeStr = modes.map(m => MODE_NAMES[m]).join(', ');
      
      const times = Object.values(program.schedule).map(s => `${s.start}-${s.stop}`);
      const timeStr = [...new Set(times)].join(', ');
      
      elements[`programSummary${index}`].innerHTML = `
        <div>Días: <span class="font-medium">${days}</span></div>
        <div>Modo: <span class="font-medium">${modeStr}</span></div>
        <div>Horario: <span class="font-medium">${timeStr}</span></div>
      `;
    } else {
      // Show create button, hide program card
      elements[`btnCreateProgram${index}`].classList.remove('hidden');
      elements[`programCard${index}`].classList.add('hidden');
    }
  }

  /**
   * Toggle program enabled/disabled state
   * @param {number} slot - Program slot index (0, 1, or 2)
   */
  function toggleProgram(slot) {
    const program = programs[slot];
    if (!program) return;
    
    program.enabled = !program.enabled;
    updateProgramSlot(slot);
    savePrograms();
    
    if (window.LogModule) {
      const status = program.enabled ? 'activado' : 'desactivado';
      LogModule.append(`🔄 Programa "${program.name}" ${status}`);
    }
    
    // If program was just enabled, check if it should execute immediately
    if (program.enabled) {
      checkAndExecutePrograms();
    }
  }

  /**
   * Edit existing program
   * Opens create screen with program data pre-loaded
   * @param {number} slot - Program slot index (0, 1, or 2)
   */
  function editProgram(slot) {
    const program = programs[slot];
    if (!program) return;
    
    // Open create program screen with existing program data
    currentSlot = slot;
    scheduleData = JSON.parse(JSON.stringify(program.schedule)); // Deep copy
    
    // Reset form first
    resetCreateForm();
    
    // Load program data into form
    loadProgramIntoForm(program);
    
    // Show create screen
    elements.createProgramScreen.classList.remove('translate-x-full');
    elements.createProgramScreen.classList.add('translate-x-0');
    
    // Update header title
    if (elements.headerTitle) {
      elements.headerTitle.textContent = `Editar: ${program.name}`;
    }
    
    if (window.LogModule) {
      LogModule.append(`✏️ Editando programa "${program.name}"`);
    }
  }

  /**
   * Load program data into create form for editing
   * Populates schedule table with existing program configuration
   * @param {Object} program - Program object to load
   */
  function loadProgramIntoForm(program) {
    const rows = elements.scheduleTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const day = row.getAttribute('data-day');
      const dayData = program.schedule[day];
      
      if (dayData) {
        const dayToggle = row.querySelector('.day-toggle');
        const modeBtns = row.querySelectorAll('.mode-btn');
        const startTime = row.querySelector('.start-time');
        const stopTime = row.querySelector('.stop-time');
        
        // Activate day
        dayToggle.classList.add('active', 'bg-primary', 'text-white', 'border-primary');
        dayToggle.classList.remove('text-slate-400');
        
        // Enable controls
        modeBtns.forEach(btn => btn.disabled = false);
        startTime.disabled = false;
        stopTime.disabled = false;
        
        // Set mode
        modeBtns.forEach(btn => {
          if (parseInt(btn.getAttribute('data-mode')) === dayData.mode) {
            btn.classList.add('bg-primary', 'text-white', 'border-primary', 'active');
          }
        });
        
        // Set times
        startTime.value = dayData.start;
        stopTime.value = dayData.stop;
      }
    });
    
    // Validate form
    validateForm();
  }

  /**
   * Delete program with confirmation
   * @param {number} slot - Program slot index (0, 1, or 2)
   */
  function deleteProgram(slot) {
    const program = programs[slot];
    if (!program) return;
    
    if (confirm(`¿Eliminar programa "${program.name}"?`)) {
      programs[slot] = null;
      updateProgramSlot(slot);
      savePrograms();
      
      if (window.LogModule) {
        LogModule.append(`🗑️ Programa "${program.name}" eliminado`);
      }
    }
  }

  // ==================== Persistence (localStorage) ====================
  
  /**
   * Save all programs to localStorage for persistence
   */
  function savePrograms() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(programs));
  }

  /**
   * Load programs from localStorage on init
   * Restores program state from previous session
   */
  function loadPrograms() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        programs = JSON.parse(saved);
        // Update all slots
        programs.forEach((_, slot) => updateProgramSlot(slot));
      } catch (e) {
        console.error('Error loading programs:', e);
      }
    }
  }

  // ==================== Screen Navigation ====================
  
  /**
   * Show programas screen with slide animation
   * Updates header with back button and title
   */
  function showScreen() {
    // Animate screen transition
    if (elements.mainScreen) {
      elements.mainScreen.classList.add('slide-left');
    }
    elements.programasScreen.classList.remove('translate-x-full');
    elements.programasScreen.classList.add('translate-x-0');
    
    // Update header
    if (elements.btnBack) {
      elements.btnBack.classList.remove('opacity-0', 'pointer-events-none');
    }
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Programas';
    }
  }

  /**
   * Hide programas screen with reverse animation
   * Returns to main screen
   */
  function hideScreen() {
    // Animate screen transition
    if (elements.mainScreen) {
      elements.mainScreen.classList.remove('slide-left');
    }
    elements.programasScreen.classList.remove('translate-x-0');
    elements.programasScreen.classList.add('translate-x-full');
    
    // Reset header
    if (elements.btnBack) {
      elements.btnBack.classList.add('opacity-0', 'pointer-events-none');
    }
    if (elements.headerTitle) {
      elements.headerTitle.textContent = 'Smart Pool';
    }
  }

  // ==================== Automatic Program Execution ====================
  
  /**
   * Start automatic execution timer
   * Checks every 15 minutes if any enabled program should be running
   * Executes immediately on start, then at regular intervals
   */
  function startExecutionTimer() {
    // Clear any existing timer
    if (executionTimer) {
      clearInterval(executionTimer);
    }
    
    // Check immediately on start
    checkAndExecutePrograms();
    
    // Then check at regular intervals
    executionTimer = setInterval(() => {
      checkAndExecutePrograms();
    }, EXECUTION_CHECK_INTERVAL);
  }

  /**
   * Check if programs should be executed and publish MQTT commands
   * 
   * Logic:
   * 1. Reset manual override if it's a new day
   * 2. Skip if manual override is active
   * 3. Find all programs matching current day and time
   * 4. Execute highest priority program (lowest slot number)
   * 5. Alert on conflicts
   * 6. Stop execution if no program should be running
   */
  function checkAndExecutePrograms() {
    // Reset manual override if it's a new day
    const now = new Date();
    if (manualOverride && manualOverrideDate) {
      const overrideDate = new Date(manualOverrideDate);
      if (now.getDate() !== overrideDate.getDate() || now.getMonth() !== overrideDate.getMonth()) {
        manualOverride = false;
        manualOverrideDate = null;
        if (window.LogModule) {
          LogModule.append('✓ Programas reanudados (nuevo día)');
        }
      }
    }
    
    // Skip execution if manually overridden
    if (manualOverride) {
      return;
    }
    
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    let programToExecute = null;
    let conflictingPrograms = [];
    
    // Check programs in order (slot 0 has priority)
    for (let i = 0; i < programs.length; i++) {
      const program = programs[i];
      if (!program || !program.enabled) continue;
      
      const daySchedule = program.schedule[currentDay];
      if (!daySchedule) continue;
      
      // Check if current time is within this schedule
      if (currentTime >= daySchedule.start && currentTime < daySchedule.stop) {
        if (!programToExecute) {
          programToExecute = { slot: i, program, daySchedule };
        } else {
          conflictingPrograms.push(program.name);
        }
      }
    }
    
    // Alert if there are conflicting programs
    if (conflictingPrograms.length > 0) {
      const message = `⚠️ Conflicto de programas: "${programToExecute.program.name}" tiene prioridad sobre: ${conflictingPrograms.join(', ')}`;
      if (window.LogModule) {
        LogModule.append(message);
      }
      // Only show alert once per execution
      if (!currentlyExecuting || currentlyExecuting.slot !== programToExecute.slot) {
        alert(message);
      }
    }
    
    // Execute the program if found
    if (programToExecute) {
      executeProgram(programToExecute.slot, programToExecute.program, programToExecute.daySchedule, currentDay);
    } else if (currentlyExecuting) {
      // No program should be running, stop current execution
      stopProgramExecution();
    }
  }

  /**
   * Execute a program by publishing MQTT commands
   * Publishes pump ON command and valve mode command
   * Only publishes if not already executing the same program
   * 
   * @param {number} slot - Program slot index (0, 1, or 2)
   * @param {Object} program - Program object
   * @param {Object} daySchedule - Schedule for current day {mode, start, stop}
   * @param {number} currentDay - Current day of week (0-6)
   */
  function executeProgram(slot, program, daySchedule, currentDay) {
    // Check if already executing this exact program
    if (currentlyExecuting && 
        currentlyExecuting.slot === slot && 
        currentlyExecuting.day === currentDay && 
        currentlyExecuting.mode === daySchedule.mode) {
      return; // Already executing, no need to republish
    }
    
    // Log program start
    if (window.LogModule) {
      LogModule.append(`▶ Ejecutando programa "${program.name}" - ${DAY_NAMES_LONG[currentDay]} - ${MODE_NAMES[daySchedule.mode]} (${daySchedule.start} - ${daySchedule.stop})`);
    }
    
    // Publish MQTT commands
    if (window.MQTTModule && window.MQTTModule.isConnected()) {
      // Turn pump ON
      window.MQTTModule.publish(
        'ON',
        window.APP_CONFIG.TOPIC_PUMP_CMD,
        (msg) => { if (window.LogModule) LogModule.append(msg); }
      );
      
      // Set valve mode
      window.MQTTModule.publish(
        String(daySchedule.mode),
        window.APP_CONFIG.TOPIC_VALVE_CMD,
        (msg) => { if (window.LogModule) LogModule.append(msg); }
      );
    }
    
    // Update execution state
    currentlyExecuting = {
      slot,
      day: currentDay,
      mode: daySchedule.mode,
      name: program.name
    };
  }

  /**
   * Stop program execution (turn off pump)
   * Called when program schedule ends or no program should be running
   */
  function stopProgramExecution() {
    if (!currentlyExecuting) return;
    
    if (window.LogModule) {
      LogModule.append(`■ Programa "${currentlyExecuting.name}" finalizado`);
    }
    
    // Publish pump OFF command
    if (window.MQTTModule && window.MQTTModule.isConnected()) {
      window.MQTTModule.publish(
        'OFF',
        window.APP_CONFIG.TOPIC_PUMP_CMD,
        (msg) => { if (window.LogModule) LogModule.append(msg); }
      );
    }
    
    currentlyExecuting = null;
  }

  /**
   * Mark manual override (pause programs until tomorrow)
   * Called from app.js when user manually controls pump/valves while program is active
   * Programs will resume automatically at midnight
   */
  function setManualOverride() {
    if (!manualOverride && currentlyExecuting) {
      manualOverride = true;
      manualOverrideDate = new Date();
      if (window.LogModule) {
        LogModule.append(`⚠️ Control manual activado - Programa "${currentlyExecuting.name}" pausado hasta mañana`);
      }
      
      // Stop the currently executing program
      stopProgramExecution();
    }
  }

  // ==================== Public API ====================
  
  /**
   * Get active program name for display
   * Checks if any enabled program should be running at current time
   * @returns {string|null} Program name if active, null if no program running
   */
  function getActiveProgramName() {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Check programs in order (first one takes precedence)
    for (const program of programs) {
      if (!program || !program.enabled) continue;
      
      const daySchedule = program.schedule[currentDay];
      if (!daySchedule) continue;
      
      // Check if current time is within this schedule
      if (currentTime >= daySchedule.start && currentTime < daySchedule.stop) {
        return program.name;
      }
    }
    
    return null;
  }

  /**
   * Get all programs (for debugging/inspection)
   * @returns {Array} Array of program objects [3 slots]
   */
  function getPrograms() {
    return programs;
  }

  // Public API
  // Exposed methods for external module interaction
  return {
    init,                    // Initialize module (call on app start)
    showScreen,              // Show programas screen
    hideScreen,              // Hide programas screen
    getActiveProgramName,    // Get name of currently active program
    getPrograms,             // Get all programs array
    setManualOverride        // Pause programs until tomorrow (manual control)
  };
})();

// Explicitly assign to window to ensure it's available globally
window.ProgramasModule = ProgramasModule;
