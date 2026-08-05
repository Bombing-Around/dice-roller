/**
 * Room Management
 * Handles room creation, joining, leaving, and real-time sync
 */

const RoomManager = (function() {
  const USER_STORAGE_KEY = 'dice_roller_user';
  
  // Current room state
  let currentRoom = null;
  let currentUserId = null;
  let currentUserName = null;
  
  // Callbacks for UI updates
  let onUsersChanged = null;
  let onLogChanged = null;
  let onRoomNameChanged = null;
  
  /**
   * Generate a random 6-character room code
   */
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  /**
   * Generate a random user ID
   */
  function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Generate a default username
   */
  function generateDefaultName() {
    const adjectives = ['Swift', 'Bold', 'Wise', 'Brave', 'Lucky', 'Noble', 'Keen', 'Wild'];
    const nouns = ['Dragon', 'Knight', 'Mage', 'Rogue', 'Ranger', 'Cleric', 'Bard', 'Warrior'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
  }
  
  /**
   * Get or create persistent user identity
   */
  function getOrCreateUserIdentity() {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Support both current (odUserId) and legacy (userId) formats
        const odUserId = parsed.odUserId || parsed.userId;
        if (odUserId && parsed.userName) {
          const identity = { odUserId, userName: parsed.userName };
          if (!parsed.odUserId) {
            // Migrate legacy identity to the current format on disk
            saveUserIdentity(identity);
          }
          return identity;
        }
      }
    } catch (e) {
      console.warn('Failed to read user identity:', e);
    }
    
    // Create new identity
    const identity = {
      odUserId: generateUserId(),
      userName: generateDefaultName()
    };
    saveUserIdentity(identity);
    return identity;
  }
  
  /**
   * Save user identity to localStorage
   */
  function saveUserIdentity(identity) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(identity));
    } catch (e) {
      console.warn('Failed to save user identity:', e);
    }
  }
  
  /**
   * Update stored username
   */
  function updateStoredUserName(newName) {
    const identity = getOrCreateUserIdentity();
    identity.userName = newName;
    saveUserIdentity(identity);
  }
  
  /**
   * Create a new room
   */
  async function createRoom() {
    if (!DataService.isConnected()) {
      return { success: false, error: 'Not connected to server. Run: docker-compose up' };
    }
    
    const roomCode = generateRoomCode();
    const identity = getOrCreateUserIdentity();
    const odUserId = identity.odUserId;
    const userName = identity.userName;

    // Set current room/user state and wire callbacks before awaiting the
    // Pusher round trip, so any events that arrive while it's in flight
    // (e.g. state sync) have somewhere to land.
    currentRoom = roomCode;
    currentUserId = odUserId;
    currentUserName = userName;
    setupPusherCallbacks();

    await PusherService.createRoom(roomCode, odUserId, userName);

    return {
      success: true,
      roomCode,
      odUserId,
      userName,
      roomName: PusherService.getRoomState().name || ''
    };
  }
  
  /**
   * Join an existing room
   */
  async function joinRoom(roomCode) {
    if (!DataService.isConnected()) {
      return { success: false, error: 'Not connected to server. Run: docker-compose up' };
    }
    
    const normalizedCode = roomCode.toUpperCase().trim();
    const identity = getOrCreateUserIdentity();
    const odUserId = identity.odUserId;
    const userName = identity.userName;

    // Set current room/user state and wire callbacks before awaiting the
    // Pusher round trip. PusherService.joinRoom() awaits the state-sync
    // response internally, so the callbacks (and currentUserId/currentRoom)
    // must already be valid by the time that response is handled, or the
    // synced history never reaches the UI.
    currentRoom = normalizedCode;
    currentUserId = odUserId;
    currentUserName = userName;
    setupPusherCallbacks();

    // In Pusher mode, any room code is valid
    // First joiner "creates" it, others join the same channel
    await PusherService.joinRoom(normalizedCode, odUserId, userName);

    return {
      success: true,
      roomCode: normalizedCode,
      odUserId,
      userName,
      roomName: PusherService.getRoomState().name || ''
    };
  }
  
  /**
   * Leave the current room
   */
  async function leaveRoom() {
    if (!currentRoom || !currentUserId) return;
    
    await PusherService.leaveRoom();
    
    currentRoom = null;
    currentUserId = null;
    currentUserName = null;
  }
  
  /**
   * Set up Pusher callbacks
   */
  function setupPusherCallbacks() {
    PusherService.setOnUsersChanged((users) => {
      if (onUsersChanged) onUsersChanged(users);
    });
    PusherService.setOnLogChanged((log) => {
      if (onLogChanged) onLogChanged(log);
    });
    PusherService.setOnRoomNameChanged((name) => {
      if (onRoomNameChanged) onRoomNameChanged(name);
    });
  }
  
  /**
   * Update user's display name
   */
  async function updateUserName(newName) {
    if (!currentRoom || !currentUserId) return { success: false };
    
    const trimmedName = newName.trim().substring(0, 50);
    if (!trimmedName) return { success: false, error: 'Name cannot be empty' };
    
    currentUserName = trimmedName;
    updateStoredUserName(trimmedName);
    
    return await PusherService.updateUserName(currentUserId, trimmedName);
  }
  
  /**
   * Update room name
   */
  async function updateRoomName(newName) {
    if (!currentRoom) return { success: false };
    
    const trimmedName = newName.trim().substring(0, 100);
    return await PusherService.updateRoomName(trimmedName);
  }
  
  /**
   * Add a roll to the log
   */
  async function addRoll(rollData, options = {}) {
    if (!currentRoom || !currentUserId) return { success: false };
    
    const state = PusherService.getRoomState();
    const orders = Object.values(state.log || {}).map(e => e.order || 0);
    const maxOrder = orders.length > 0 ? Math.max(...orders) : 0;
    
    const entry = {
      type: 'roll',
      order: maxOrder + 1,
      userId: currentUserId,
      userName: currentUserName,
      createdAt: Date.now(),
      notation: rollData.notation,
      results: rollData.results,
      total: rollData.total,
      critical: rollData.critical || false,
      fumble: rollData.fumble || false
    };
    
    if (options.action) entry.action = options.action.trim();
    if (options.description) entry.description = options.description.trim();
    if (options.outcome) entry.outcome = options.outcome.trim();
    
    return await PusherService.addRoll(entry);
  }
  
  /**
   * Add a note to the log
   */
  async function addNote(content, afterOrder = null) {
    if (!currentRoom || !currentUserId) return { success: false };
    if (!content.trim()) return { success: false, error: 'Note cannot be empty' };
    
    const state = PusherService.getRoomState();
    const entries = Object.values(state.log || {}).sort((a, b) => a.order - b.order);
    
    let newOrder;
    if (afterOrder !== null) {
      const afterEntry = entries.find(e => e.order === afterOrder);
      const afterIndex = entries.indexOf(afterEntry);
      const nextEntry = entries[afterIndex + 1];
      newOrder = nextEntry ? (afterOrder + nextEntry.order) / 2 : afterOrder + 1;
    } else {
      const orders = entries.map(e => e.order || 0);
      const maxOrder = orders.length > 0 ? Math.max(...orders) : 0;
      newOrder = maxOrder + 1;
    }
    
    const entry = {
      type: 'note',
      order: newOrder,
      userId: currentUserId,
      userName: currentUserName,
      createdAt: Date.now(),
      content: content.trim()
    };
    
    return await PusherService.addNote(entry);
  }
  
  /**
   * Update details on an existing roll
   */
  async function updateRollDetails(entryId, details) {
    if (!currentRoom || !currentUserId) return { success: false };
    
    const updates = {};
    if (details.action !== undefined) updates.action = details.action.trim();
    if (details.description !== undefined) updates.description = details.description.trim();
    if (details.outcome !== undefined) updates.outcome = details.outcome.trim();
    
    if (Object.keys(updates).length === 0) return { success: true };
    
    return await PusherService.updateRollDetails(entryId, updates);
  }
  
  /**
   * Export log as JSON
   */
  async function exportLog() {
    if (!currentRoom) return null;
    
    const roomData = PusherService.getRoomState();
    const logEntries = roomData.log || {};
    const sortedLog = Object.entries(logEntries)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.order - b.order);
    
    return {
      roomCode: currentRoom,
      roomName: roomData.name || '',
      exportedAt: new Date().toISOString(),
      log: sortedLog
    };
  }
  
  // Callback setters
  function setOnUsersChanged(callback) { onUsersChanged = callback; }
  function setOnLogChanged(callback) { onLogChanged = callback; }
  function setOnRoomNameChanged(callback) { onRoomNameChanged = callback; }
  
  // Getters
  function getCurrentRoom() { return currentRoom; }
  function getCurrentUserId() { return currentUserId; }
  function getCurrentUserName() { return currentUserName; }
  
  return {
    createRoom,
    joinRoom,
    leaveRoom,
    updateUserName,
    updateRoomName,
    addRoll,
    addNote,
    updateRollDetails,
    exportLog,
    setOnUsersChanged,
    setOnLogChanged,
    setOnRoomNameChanged,
    getCurrentRoom,
    getCurrentUserId,
    getCurrentUserName
  };
})();
