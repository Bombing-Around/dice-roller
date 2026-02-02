/**
 * Data Service
 * Connects to Pusher/Soketi for real-time multiplayer
 * 
 * For local development, run Soketi:
 *   docker-compose up
 */

const DataService = (function() {
  let connected = false;
  let initialized = false;
  
  /**
   * Initialize the data service
   * Connects to Pusher/Soketi - fails if not available
   */
  async function init() {
    if (initialized) return connected;
    
    if (typeof PusherService === 'undefined') {
      console.error('DataService: PusherService not loaded');
      return false;
    }
    
    connected = await PusherService.init();
    initialized = true;
    
    if (connected) {
      console.log('DataService: Connected to Soketi/Pusher');
    } else {
      console.error('DataService: Failed to connect to Soketi/Pusher');
      console.error('DataService: Make sure Soketi is running: docker-compose up');
    }
    
    return connected;
  }
  
  /**
   * Check if connected
   */
  function isConnected() {
    return connected;
  }
  
  /**
   * Generate a unique ID
   */
  function generateId() {
    return PusherService.generateId();
  }
  
  /**
   * Get current timestamp
   */
  function serverTimestamp() {
    return Date.now();
  }
  
  return {
    init,
    isConnected,
    generateId,
    serverTimestamp
  };
})();
