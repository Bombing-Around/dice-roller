/**
 * Main Application
 * Wires together all modules and handles events
 */

const App = (function() {
  /**
   * Initialize the application
   */
  async function init() {
    // Initialize UI first (so we can show loading state)
    UI.init();
    
    // Initialize data service (auto-detects local vs Pusher mode)
    // This waits for Soketi connection attempt
    await DataService.init();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up room callbacks
    setupRoomCallbacks();
    
    // Show mode indicator
    showModeIndicator();
    
    // Check for room code in URL hash
    checkURLHash();
    
    console.log('Dice Roller initialized');
  }
  
  /**
   * Show connection status indicator
   */
  function showModeIndicator() {
    const connected = DataService.isConnected();
    const indicator = document.createElement('div');
    indicator.id = 'mode-indicator';
    
    if (connected) {
      indicator.className = 'bg-green-600 text-green-100 text-center text-sm py-1';
      indicator.innerHTML = 'Connected - Real-time sync active';
    } else {
      indicator.className = 'bg-red-600 text-red-100 text-center text-sm py-1';
      indicator.innerHTML = 'Not Connected - Run <code class="bg-red-700 px-1 rounded">docker-compose up</code> to start Soketi';
    }
    
    document.body.prepend(indicator);
  }
  
  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // Home screen events
    UI.elements.createRoomBtn.addEventListener('click', handleCreateRoom);
    UI.elements.joinRoomBtn.addEventListener('click', handleJoinRoom);
    UI.elements.roomCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleJoinRoom();
    });
    
    // Room screen events
    UI.elements.leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    UI.elements.copyCodeBtn.addEventListener('click', UI.copyRoomCode);
    
    // User name change
    UI.elements.userNameInput.addEventListener('change', handleUserNameChange);
    UI.elements.userNameInput.addEventListener('blur', handleUserNameChange);
    
    // Room name change
    UI.elements.roomNameInput.addEventListener('change', handleRoomNameChange);
    UI.elements.roomNameInput.addEventListener('blur', handleRoomNameChange);
    
    // Dice rolling
    UI.elements.rollBtn.addEventListener('click', handleRoll);
    UI.elements.diceInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleRoll();
    });
    
    // Quick dice buttons
    UI.elements.diceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dice = btn.dataset.dice;
        UI.setDiceInput(dice);
        handleRoll();
      });
    });
    
    // Note adding
    UI.elements.addNoteBtn.addEventListener('click', handleAddNote);
    UI.elements.noteInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAddNote();
    });
    
    // Export log
    UI.elements.exportLogBtn.addEventListener('click', handleExportLog);
    
    // Room deleted event
    window.addEventListener('roomDeleted', () => {
      UI.showToast('Room was closed', 'info');
      UI.showHomeScreen();
    });
    
    // Handle URL hash changes
    window.addEventListener('hashchange', checkURLHash);
  }
  
  /**
   * Set up room manager callbacks
   */
  function setupRoomCallbacks() {
    RoomManager.setOnUsersChanged((users) => {
      UI.renderUsers(users, RoomManager.getCurrentUserId());
    });
    
    RoomManager.setOnLogChanged((log) => {
      UI.renderLog(log, RoomManager.getCurrentUserId());
    });
    
    RoomManager.setOnRoomNameChanged((name) => {
      UI.setRoomNameInput(name);
    });
  }
  
  /**
   * Check URL hash for room code
   */
  async function checkURLHash() {
    const hash = window.location.hash.slice(1);
    if (hash && hash.length === 6 && !RoomManager.getCurrentRoom()) {
      // Auto-join room from URL
      UI.setButtonLoading(UI.elements.joinRoomBtn, true);
      const result = await RoomManager.joinRoom(hash);
      UI.setButtonLoading(UI.elements.joinRoomBtn, false);
      
      if (result.success) {
        UI.showRoomScreen(result.roomCode, result.userName, result.roomName);
      } else {
        UI.showJoinError(result.error);
        window.location.hash = '';
      }
    }
  }
  
  /**
   * Handle create room button click
   */
  async function handleCreateRoom() {
    UI.setButtonLoading(UI.elements.createRoomBtn, true);
    
    const result = await RoomManager.createRoom();
    
    UI.setButtonLoading(UI.elements.createRoomBtn, false);
    
    if (result.success) {
      // Update URL hash
      window.location.hash = result.roomCode;
      UI.showRoomScreen(result.roomCode, result.userName);
      UI.showToast('Room created!', 'success');
    } else {
      UI.showToast('Failed to create room: ' + result.error, 'error');
    }
  }
  
  /**
   * Handle join room button click
   */
  async function handleJoinRoom() {
    const roomCode = UI.getRoomCodeInput();
    
    if (!roomCode) {
      UI.showJoinError('Please enter a room code');
      return;
    }
    
    if (roomCode.length !== 6) {
      UI.showJoinError('Room code must be 6 characters');
      return;
    }
    
    UI.hideJoinError();
    UI.setButtonLoading(UI.elements.joinRoomBtn, true);
    
    const result = await RoomManager.joinRoom(roomCode);
    
    UI.setButtonLoading(UI.elements.joinRoomBtn, false);
    
    if (result.success) {
      // Update URL hash
      window.location.hash = result.roomCode;
      UI.showRoomScreen(result.roomCode, result.userName, result.roomName);
      UI.showToast('Joined room!', 'success');
    } else {
      UI.showJoinError(result.error);
    }
  }
  
  /**
   * Handle leave room button click
   */
  async function handleLeaveRoom() {
    await RoomManager.leaveRoom();
    window.location.hash = '';
    UI.showHomeScreen();
  }
  
  /**
   * Handle user name change
   */
  async function handleUserNameChange() {
    const newName = UI.getUserNameInput();
    if (newName && newName !== RoomManager.getCurrentUserName()) {
      const result = await RoomManager.updateUserName(newName);
      if (!result.success) {
        UI.showToast('Failed to update name', 'error');
      }
    }
  }
  
  /**
   * Handle room name change
   */
  async function handleRoomNameChange() {
    const newName = UI.getRoomNameInput();
    await RoomManager.updateRoomName(newName);
  }
  
  /**
   * Handle dice roll
   */
  async function handleRoll() {
    const notation = UI.getDiceInput();
    
    if (!notation) {
      UI.showToast('Enter dice notation (e.g., 2d20+5)', 'error');
      return;
    }
    
    // Roll the dice
    const rollResult = DiceRoller.roll(notation);
    
    if (!rollResult.success) {
      UI.showToast(rollResult.error, 'error');
      return;
    }
    
    // Add to room log (no pre-fill options, user can edit after)
    const result = await RoomManager.addRoll(rollResult);
    
    if (result.success) {
      UI.setDiceInput('');
    } else {
      UI.showToast('Failed to save roll', 'error');
    }
  }
  
  /**
   * Handle add note
   */
  async function handleAddNote() {
    const content = UI.getNoteInput();
    
    if (!content) {
      return;
    }
    
    const result = await RoomManager.addNote(content);
    
    if (result.success) {
      UI.clearNoteInput();
    } else {
      UI.showToast('Failed to add note', 'error');
    }
  }
  
  /**
   * Handle export log
   */
  async function handleExportLog() {
    const data = await RoomManager.exportLog();
    
    if (!data) {
      UI.showToast('Failed to export log', 'error');
      return;
    }
    
    const filename = `dice-log-${data.roomCode}-${new Date().toISOString().split('T')[0]}.json`;
    UI.downloadJSON(data, filename);
    UI.showToast('Log exported!', 'success');
  }
  
  // Public API
  return {
    init
  };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
