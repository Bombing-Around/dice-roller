/**
 * Pusher Service
 * Real-time sync using Pusher Channels (or compatible API like Soketi)
 * 
 * Uses presence channels for user tracking and client events for broadcasting.
 * State is distributed - existing clients share history with new joiners.
 */

const PusherService = (function() {
  // Configuration for local development with Soketi
  const LOCAL_CONFIG = {
    key: 'dice-roller-key',
    cluster: 'mt1',  // Required by Pusher client, any value works for Soketi
    wsHost: window.location.hostname,  // Use same hostname as page
    wsPort: 6001,
    wssPort: 6001,
    forceTLS: false,
    disableStats: true,
    enabledTransports: ['ws', 'wss'],
  };
  
  // Configuration for production Pusher (fill in your details)
  const PROD_CONFIG = {
    key: 'YOUR_PUSHER_KEY',
    cluster: 'YOUR_CLUSTER', // e.g., 'us2', 'eu', 'ap1'
  };
  
  // Auto-detect: use local if on localhost/127.0.0.1, otherwise try production
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const config = isLocal ? LOCAL_CONFIG : PROD_CONFIG;
  
  console.log('PusherService config:', { isLocal, hostname: window.location.hostname, config });
  
  let pusher = null;
  let currentChannel = null;
  let currentUserId = null;
  let currentUserName = null;
  let roomState = { users: {}, log: {}, name: '' };
  let initialized = false;
  
  // Callbacks
  let onUsersChanged = null;
  let onLogChanged = null;
  let onRoomNameChanged = null;
  
  /**
   * Check if Pusher/Soketi is configured
   */
  function isConfigured() {
    // For local dev, always configured (Soketi)
    if (isLocal) return true;
    // For production, check if real Pusher key is set
    return config.key !== 'YOUR_PUSHER_KEY';
  }
  
  /**
   * Initialize Pusher/Soketi
   * Returns a promise that resolves when connected or rejects on failure
   */
  function init() {
    if (initialized) return Promise.resolve(true);
    if (!isConfigured()) return Promise.resolve(false);
    
    // Check if Pusher SDK is loaded
    if (typeof Pusher === 'undefined') {
      console.error('Pusher SDK not loaded');
      return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
      try {
        console.log('Pusher connecting to Soketi at', config.wsHost + ':' + config.wsPort);
        
        pusher = new Pusher(config.key, {
          cluster: 'mt1',
          wsHost: config.wsHost,
          wsPort: config.wsPort,
          forceTLS: false,
          disableStats: true,
          enabledTransports: ['ws', 'wss'],
        });
        
        // Log all state changes
        pusher.connection.bind('state_change', (states) => {
          console.log('Pusher state:', states.previous, '->', states.current);
        });
        
        // Wait for actual connection
        const timeout = setTimeout(() => {
          console.error('Pusher/Soketi connection timeout after 5s');
          console.error('Connection state:', pusher.connection.state);
          resolve(false);
        }, 5000);
        
        pusher.connection.bind('connected', () => {
          clearTimeout(timeout);
          initialized = true;
          console.log('Pusher/Soketi connected! Socket ID:', pusher.connection.socket_id);
          resolve(true);
        });
        
        pusher.connection.bind('error', (err) => {
          console.error('Pusher/Soketi connection error:', err);
          // Don't resolve yet, might recover
        });
        
        pusher.connection.bind('failed', () => {
          clearTimeout(timeout);
          console.error('Pusher/Soketi connection failed');
          resolve(false);
        });
        
        pusher.connection.bind('unavailable', () => {
          console.warn('Pusher/Soketi unavailable, retrying...');
          // Don't resolve yet, might recover
        });
        
      } catch (error) {
        console.error('Pusher/Soketi initialization failed:', error);
        resolve(false);
      }
    });
  }
  
  /**
   * Generate unique user ID
   */
  function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Generate unique entry ID
   */
  function generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return timestamp + random;
  }
  
  /**
   * Get current timestamp
   */
  function serverTimestamp() {
    return Date.now();
  }
  
  /**
   * Subscribe to a room channel
   */
  function subscribeToRoom(roomCode) {
    const channelName = `room-${roomCode}`;
    currentChannel = pusher.subscribe(channelName);
    
    // Listen for events
    currentChannel.bind('roll', handleRollEvent);
    currentChannel.bind('note', handleNoteEvent);
    currentChannel.bind('roll-updated', handleRollUpdatedEvent);
    currentChannel.bind('user-joined', handleUserJoined);
    currentChannel.bind('user-left', handleUserLeft);
    currentChannel.bind('user-updated', handleUserUpdated);
    currentChannel.bind('room-name-changed', handleRoomNameChanged);
    currentChannel.bind('state-sync-request', handleStateSyncRequest);
    currentChannel.bind('state-sync-response', handleStateSyncResponse);
    
    return currentChannel;
  }
  
  /**
   * Unsubscribe from current channel
   */
  function unsubscribeFromRoom() {
    if (currentChannel) {
      currentChannel.unbind_all();
      pusher.unsubscribe(currentChannel.name);
      currentChannel = null;
    }
  }
  
  // Event handlers
  function handleRollEvent(data) {
    roomState.log[data.id] = data.entry;
    if (onLogChanged) onLogChanged(roomState.log);
  }
  
  function handleNoteEvent(data) {
    roomState.log[data.id] = data.entry;
    if (onLogChanged) onLogChanged(roomState.log);
  }
  
  function handleRollUpdatedEvent(data) {
    if (roomState.log[data.entryId]) {
      Object.assign(roomState.log[data.entryId], data.updates);
      if (onLogChanged) onLogChanged(roomState.log);
    }
  }
  
  function handleUserJoined(data) {
    roomState.users[data.userId] = {
      name: data.userName,
      joinedAt: data.timestamp
    };
    if (onUsersChanged) onUsersChanged(roomState.users);
    
    // If we're an existing user, send state to new user
    if (data.userId !== currentUserId && Object.keys(roomState.log).length > 0) {
      // Small delay to avoid race conditions
      setTimeout(() => {
        broadcastEvent('state-sync-response', {
          targetUserId: data.userId,
          state: roomState
        });
      }, 500);
    }
  }
  
  function handleUserLeft(data) {
    delete roomState.users[data.userId];
    if (onUsersChanged) onUsersChanged(roomState.users);
  }
  
  function handleUserUpdated(data) {
    if (roomState.users[data.userId]) {
      roomState.users[data.userId].name = data.userName;
      if (onUsersChanged) onUsersChanged(roomState.users);
    }
  }
  
  function handleRoomNameChanged(data) {
    roomState.name = data.name;
    if (onRoomNameChanged) onRoomNameChanged(data.name);
  }
  
  function handleStateSyncRequest(data) {
    // Another user is requesting state
    if (data.requesterId !== currentUserId && Object.keys(roomState.log).length > 0) {
      broadcastEvent('state-sync-response', {
        targetUserId: data.requesterId,
        state: roomState
      });
    }
  }
  
  function handleStateSyncResponse(data) {
    // State sync meant for us
    if (data.targetUserId === currentUserId) {
      // Merge state (prefer existing entries to avoid duplicates)
      Object.entries(data.state.log || {}).forEach(([id, entry]) => {
        if (!roomState.log[id]) {
          roomState.log[id] = entry;
        }
      });
      Object.entries(data.state.users || {}).forEach(([id, user]) => {
        if (!roomState.users[id]) {
          roomState.users[id] = user;
        }
      });
      if (data.state.name && !roomState.name) {
        roomState.name = data.state.name;
      }
      
      if (onLogChanged) onLogChanged(roomState.log);
      if (onUsersChanged) onUsersChanged(roomState.users);
      if (onRoomNameChanged) onRoomNameChanged(roomState.name);
      
      // Resolve pending join if waiting
      if (stateSyncResolver) {
        stateSyncResolver();
        stateSyncResolver = null;
      }
    }
  }
  
  /**
   * Broadcast an event to the channel
   * Note: Pusher client events require presence/private channels and auth
   * For public channels, we need a backend. As a workaround for MVP,
   * we'll use triggered events if available, or fall back to polling.
   */
  /**
   * Broadcast event via server
   * The server handles Soketi authentication
   */
  async function broadcastEvent(eventName, data) {
    if (!currentChannel) return;
    
    try {
      const response = await fetch('/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: currentChannel.name,
          event: eventName,
          data: data,
        }),
      });
      
      if (!response.ok) {
        console.error('Broadcast failed:', response.status);
      }
    } catch (e) {
      console.error('Broadcast error:', e.message);
    }
  }
  
  // Firebase-compatible API
  
  async function createRoom(roomCode, userId, userName) {
    currentUserId = userId;
    currentUserName = userName;
    roomState = {
      users: {
        [userId]: { name: userName, joinedAt: Date.now() }
      },
      log: {},
      name: ''
    };
    
    subscribeToRoom(roomCode);
    
    // Announce join
    broadcastEvent('user-joined', {
      userId,
      userName,
      timestamp: Date.now()
    });
    
    return { success: true };
  }
  
  let stateSyncResolver = null;
  
  async function joinRoom(roomCode, userId, userName) {
    currentUserId = userId;
    currentUserName = userName;
    roomState = {
      users: {
        [userId]: { name: userName, joinedAt: Date.now() }
      },
      log: {},
      name: ''
    };
    
    subscribeToRoom(roomCode);
    
    // Announce join
    broadcastEvent('user-joined', {
      userId,
      userName,
      timestamp: Date.now()
    });
    
    // Wait for state sync with timeout
    const stateSyncPromise = new Promise(resolve => {
      stateSyncResolver = resolve;
      
      // Timeout after 1.5s - room might be empty or we're the first
      setTimeout(() => {
        stateSyncResolver = null;
        resolve();
      }, 1500);
    });
    
    // Request state from existing users
    setTimeout(() => {
      broadcastEvent('state-sync-request', {
        requesterId: userId
      });
    }, 100);
    
    await stateSyncPromise;
    return { success: true };
  }
  
  async function leaveRoom() {
    if (currentChannel && currentUserId) {
      broadcastEvent('user-left', {
        userId: currentUserId
      });
      unsubscribeFromRoom();
    }
    
    currentUserId = null;
    currentUserName = null;
    roomState = { users: {}, log: {}, name: '' };
  }
  
  async function addRoll(entry) {
    const id = generateId();
    roomState.log[id] = entry;
    
    broadcastEvent('roll', { id, entry });
    if (onLogChanged) onLogChanged(roomState.log);
    
    return { success: true, key: id };
  }
  
  async function addNote(entry) {
    const id = generateId();
    roomState.log[id] = entry;
    
    broadcastEvent('note', { id, entry });
    if (onLogChanged) onLogChanged(roomState.log);
    
    return { success: true, key: id };
  }
  
  async function updateUserName(userId, newName) {
    if (roomState.users[userId]) {
      roomState.users[userId].name = newName;
      currentUserName = newName;
      
      broadcastEvent('user-updated', { userId, userName: newName });
      if (onUsersChanged) onUsersChanged(roomState.users);
    }
    return { success: true };
  }
  
  async function updateRoomName(name) {
    roomState.name = name;
    broadcastEvent('room-name-changed', { name });
    if (onRoomNameChanged) onRoomNameChanged(name);
    return { success: true };
  }
  
  async function updateRollDetails(entryId, updates) {
    if (roomState.log[entryId]) {
      Object.assign(roomState.log[entryId], updates);
      broadcastEvent('roll-updated', { entryId, updates });
      if (onLogChanged) onLogChanged(roomState.log);
    }
    return { success: true };
  }
  
  function setOnUsersChanged(callback) {
    onUsersChanged = callback;
  }
  
  function setOnLogChanged(callback) {
    onLogChanged = callback;
  }
  
  function setOnRoomNameChanged(callback) {
    onRoomNameChanged = callback;
  }
  
  function getRoomState() {
    return roomState;
  }
  
  function getCurrentUserId() {
    return currentUserId;
  }
  
  function getCurrentUserName() {
    return currentUserName;
  }
  
  // Public API
  return {
    isConfigured,
    init,
    generateId,
    generateUserId,
    serverTimestamp,
    createRoom,
    joinRoom,
    leaveRoom,
    addRoll,
    addNote,
    updateUserName,
    updateRoomName,
    updateRollDetails,
    setOnUsersChanged,
    setOnLogChanged,
    setOnRoomNameChanged,
    getRoomState,
    getCurrentUserId,
    getCurrentUserName
  };
})();
