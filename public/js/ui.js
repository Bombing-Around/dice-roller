/**
 * UI Module
 * Handles rendering and UI interactions
 */

const UI = (function() {
  // DOM Element references
  const elements = {};
  
  /**
   * Initialize DOM element references
   */
  function init() {
    // Screens
    elements.homeScreen = document.getElementById('home-screen');
    elements.roomScreen = document.getElementById('room-screen');
    
    // Home screen elements
    elements.createRoomBtn = document.getElementById('create-room-btn');
    elements.roomCodeInput = document.getElementById('room-code-input');
    elements.joinRoomBtn = document.getElementById('join-room-btn');
    elements.joinError = document.getElementById('join-error');
    
    // Room screen elements
    elements.roomCodeDisplay = document.getElementById('room-code-display');
    elements.copyCodeBtn = document.getElementById('copy-code-btn');
    elements.roomNameInput = document.getElementById('room-name-input');
    elements.userNameInput = document.getElementById('user-name-input');
    elements.leaveRoomBtn = document.getElementById('leave-room-btn');
    elements.usersList = document.getElementById('users-list');
    elements.exportLogBtn = document.getElementById('export-log-btn');
    
    // Dice input elements
    elements.diceInput = document.getElementById('dice-input');
    elements.rollBtn = document.getElementById('roll-btn');
    elements.diceBtns = document.querySelectorAll('.dice-btn');
    
    // Note input elements
    elements.noteInput = document.getElementById('note-input');
    elements.addNoteBtn = document.getElementById('add-note-btn');
    
    // Log elements
    elements.logContainer = document.getElementById('log-container');
    elements.logList = document.getElementById('log-list');
    elements.emptyLogMessage = document.getElementById('empty-log-message');
  }
  
  /**
   * Show home screen, hide room screen
   */
  function showHomeScreen() {
    elements.homeScreen.classList.remove('hidden');
    elements.roomScreen.classList.add('hidden');
    
    // Clear any error messages
    hideJoinError();
    elements.roomCodeInput.value = '';
  }
  
  /**
   * Show room screen, hide home screen
   * @param {string} roomCode - Room code to display
   * @param {string} userName - User's name
   * @param {string} roomName - Room name (optional)
   */
  function showRoomScreen(roomCode, userName, roomName = '') {
    elements.homeScreen.classList.add('hidden');
    elements.roomScreen.classList.remove('hidden');
    
    elements.roomCodeDisplay.textContent = roomCode;
    elements.userNameInput.value = userName;
    elements.roomNameInput.value = roomName;
    
    // Clear inputs
    elements.diceInput.value = '';
    elements.noteInput.value = '';
    
    // Focus dice input
    elements.diceInput.focus();
  }
  
  /**
   * Show join error message
   * @param {string} message - Error message
   */
  function showJoinError(message) {
    elements.joinError.textContent = message;
    elements.joinError.classList.remove('hidden');
  }
  
  /**
   * Hide join error message
   */
  function hideJoinError() {
    elements.joinError.classList.add('hidden');
  }
  
  /**
   * Render users list
   * @param {object} users - Users object from Firebase
   * @param {string} currentUserId - Current user's ID
   */
  function renderUsers(users, currentUserId) {
    elements.usersList.innerHTML = '';
    
    Object.entries(users).forEach(([userId, userData]) => {
      const li = document.createElement('li');
      li.className = 'user-online text-sm text-gray-300 py-1';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = userData.name;
      
      if (userId === currentUserId) {
        nameSpan.textContent += ' (you)';
        nameSpan.className = 'text-orange-400';
      }
      
      li.appendChild(nameSpan);
      elements.usersList.appendChild(li);
    });
  }
  
  /**
   * Render log entries
   * @param {object} logData - Log object from Firebase
   * @param {string} currentUserId - Current user's ID
   */
  function renderLog(logData, currentUserId) {
    // Convert to array and sort by order
    const entries = Object.entries(logData || {})
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.order - b.order);
    
    // Show/hide empty message
    if (entries.length === 0) {
      elements.emptyLogMessage.classList.remove('hidden');
      elements.logList.innerHTML = '';
      elements.logList.appendChild(elements.emptyLogMessage);
      return;
    }
    
    elements.emptyLogMessage.classList.add('hidden');
    elements.logList.innerHTML = '';
    
    entries.forEach((entry, index) => {
      const entryEl = createLogEntry(entry, currentUserId, index === entries.length - 1);
      elements.logList.appendChild(entryEl);
    });
    
    // Scroll to bottom for new entries
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  }
  
  /**
   * Create a log entry element
   * @param {object} entry - Log entry data
   * @param {string} currentUserId - Current user's ID
   * @param {boolean} isLast - Whether this is the last entry
   */
  function createLogEntry(entry, currentUserId, isLast) {
    const div = document.createElement('div');
    div.className = `log-entry p-3 rounded-lg ${entry.type === 'roll' ? 'log-entry-roll' : 'log-entry-note'}`;
    div.dataset.order = entry.order;
    div.dataset.id = entry.id;
    
    if (entry.type === 'roll') {
      div.innerHTML = createRollEntryHTML(entry, currentUserId);
      
      // Wire up edit button if it exists (only for own rolls)
      const editBtn = div.querySelector('.edit-roll-btn');
      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          showEditRollModal(entry.id, entry);
        };
      }
    } else {
      div.innerHTML = createNoteEntryHTML(entry, currentUserId);
    }
    
    // Add insert note button (appears on hover)
    const insertBtn = document.createElement('button');
    insertBtn.className = 'insert-note-btn text-xs text-gray-500 hover:text-gray-300 mt-2';
    insertBtn.textContent = '+ Add note after';
    insertBtn.onclick = () => showInsertNoteModal(entry.order);
    div.appendChild(insertBtn);
    
    return div;
  }
  
  /**
   * Create HTML for a roll entry
   * @param {object} entry - Roll entry data
   * @param {string} currentUserId - Current user's ID
   */
  function createRollEntryHTML(entry, currentUserId) {
    const isOwn = entry.userId === currentUserId;
    const time = entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : '';
    
    // Format individual dice results
    let resultsHTML = '';
    if (entry.results && Array.isArray(entry.results)) {
      const resultParts = entry.results.map(group => {
        if (group.rolls && group.rolls.length > 1) {
          return `<span class="text-gray-400">${group.dice}:</span> [${group.rolls.join(', ')}]`;
        } else if (group.rolls && group.rolls.length === 1) {
          return `<span class="text-gray-400">${group.dice}:</span> [${group.rolls[0]}]`;
        }
        return '';
      }).filter(Boolean);
      resultsHTML = resultParts.join(' + ');
    }
    
    // Total with critical/fumble styling
    let totalClass = 'text-2xl font-bold roll-total';
    if (entry.critical) totalClass += ' roll-critical';
    if (entry.fumble) totalClass += ' roll-fumble';
    
    let html = `
      <div class="flex justify-between items-start mb-1">
        <span class="text-sm ${isOwn ? 'text-orange-400' : 'text-gray-400'}">${escapeHTML(entry.userName)}</span>
        <div class="flex items-center gap-2">
          ${isOwn ? `<button class="edit-roll-btn text-xs text-gray-500 hover:text-orange-400" title="Edit details">Edit</button>` : ''}
          <span class="text-xs text-gray-500">${time}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="${totalClass}">${entry.total}</span>
        <div class="flex-1">
          <div class="text-sm text-gray-300">${entry.notation}</div>
          <div class="text-xs text-gray-500">${resultsHTML}</div>
        </div>
      </div>
    `;
    
    // Details section (action/description/outcome)
    html += `<div class="roll-details mt-2 text-sm border-t border-gray-700 pt-2 ${!entry.action && !entry.description && !entry.outcome ? 'hidden' : ''}">`;
    if (entry.action) {
      html += `<div><span class="text-gray-500">Action:</span> ${escapeHTML(entry.action)}</div>`;
    }
    if (entry.description) {
      html += `<div><span class="text-gray-500">Description:</span> ${escapeHTML(entry.description)}</div>`;
    }
    if (entry.outcome) {
      html += `<div><span class="text-gray-500">Outcome:</span> ${escapeHTML(entry.outcome)}</div>`;
    }
    html += '</div>';
    
    // Critical/Fumble badge
    if (entry.critical) {
      html += '<div class="mt-2"><span class="bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded">CRITICAL!</span></div>';
    } else if (entry.fumble) {
      html += '<div class="mt-2"><span class="bg-red-600 text-red-100 text-xs px-2 py-1 rounded">FUMBLE!</span></div>';
    }
    
    return html;
  }
  
  /**
   * Create HTML for a note entry
   * @param {object} entry - Note entry data
   * @param {string} currentUserId - Current user's ID
   */
  function createNoteEntryHTML(entry, currentUserId) {
    const isOwn = entry.userId === currentUserId;
    const time = entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : '';
    
    return `
      <div class="flex justify-between items-start mb-1">
        <span class="text-sm ${isOwn ? 'text-orange-400' : 'text-gray-400'}">${entry.userName}</span>
        <span class="text-xs text-gray-500">${time}</span>
      </div>
      <div class="text-gray-200 whitespace-pre-wrap">${escapeHTML(entry.content)}</div>
    `;
  }
  
  /**
   * Show modal to insert a note after a specific entry
   * @param {number} afterOrder - Order value to insert after (null to append)
   */
  function showInsertNoteModal(afterOrder = null) {
    // Remove existing modal if any
    const existingModal = document.getElementById('insert-note-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'insert-note-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 class="text-lg font-semibold text-white mb-4">${afterOrder !== null ? 'Insert Note' : 'Add Note'}</h3>
        <div>
          <textarea id="insert-note-content" rows="4"
            placeholder="Enter your note..."
            class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500 resize-none"></textarea>
        </div>
        <div class="flex gap-2 mt-4">
          <button id="insert-note-save-btn" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded transition">
            Add Note
          </button>
          <button id="insert-note-cancel-btn" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded transition">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus textarea
    const textarea = document.getElementById('insert-note-content');
    textarea.focus();
    
    // Handle save
    document.getElementById('insert-note-save-btn').onclick = async () => {
      const content = textarea.value.trim();
      if (content) {
        await RoomManager.addNote(content, afterOrder);
      }
      modal.remove();
    };
    
    // Handle cancel
    document.getElementById('insert-note-cancel-btn').onclick = () => {
      modal.remove();
    };
    
    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    
    // Handle keyboard
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter' && e.ctrlKey) {
        // Ctrl+Enter to submit
        const content = textarea.value.trim();
        if (content) {
          RoomManager.addNote(content, afterOrder);
        }
        modal.remove();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }
  
  /**
   * Show edit modal for a roll entry
   * @param {string} entryId - Log entry ID
   * @param {object} entry - Current entry data
   */
  function showEditRollModal(entryId, entry) {
    // Remove existing modal if any
    const existingModal = document.getElementById('edit-roll-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'edit-roll-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 class="text-lg font-semibold text-white mb-4">Edit Roll Details</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Action</label>
            <input type="text" id="edit-action" value="${escapeHTML(entry.action || '')}" 
              placeholder="e.g., Attack, Perception Check"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Description</label>
            <input type="text" id="edit-description" value="${escapeHTML(entry.description || '')}"
              placeholder="e.g., Swinging sword at goblin"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Outcome</label>
            <input type="text" id="edit-outcome" value="${escapeHTML(entry.outcome || '')}"
              placeholder="e.g., Hit! 12 damage"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-orange-500">
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <button id="edit-save-btn" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded transition">
            Save
          </button>
          <button id="edit-cancel-btn" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded transition">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus first input
    document.getElementById('edit-action').focus();
    
    // Handle save
    document.getElementById('edit-save-btn').onclick = async () => {
      const details = {
        action: document.getElementById('edit-action').value,
        description: document.getElementById('edit-description').value,
        outcome: document.getElementById('edit-outcome').value
      };
      
      await RoomManager.updateRollDetails(entryId, details);
      modal.remove();
    };
    
    // Handle cancel
    document.getElementById('edit-cancel-btn').onclick = () => {
      modal.remove();
    };
    
    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    
    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }
  
  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  /**
   * Copy room code to clipboard
   */
  async function copyRoomCode() {
    const code = elements.roomCodeDisplay.textContent;
    try {
      await navigator.clipboard.writeText(code);
      
      // Visual feedback
      elements.copyCodeBtn.classList.add('copy-success');
      setTimeout(() => {
        elements.copyCodeBtn.classList.remove('copy-success');
      }, 1000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
  
  /**
   * Get dice input value
   */
  function getDiceInput() {
    return elements.diceInput.value.trim();
  }
  
  /**
   * Set dice input value
   * @param {string} value - Value to set
   */
  function setDiceInput(value) {
    elements.diceInput.value = value;
  }
  
  /**
   * Get note input value
   */
  function getNoteInput() {
    return elements.noteInput.value.trim();
  }
  
  /**
   * Clear note input
   */
  function clearNoteInput() {
    elements.noteInput.value = '';
  }
  
  /**
   * Get room code input value
   */
  function getRoomCodeInput() {
    return elements.roomCodeInput.value.trim();
  }
  
  /**
   * Get user name input value
   */
  function getUserNameInput() {
    return elements.userNameInput.value.trim();
  }
  
  /**
   * Get room name input value
   */
  function getRoomNameInput() {
    return elements.roomNameInput.value.trim();
  }
  
  /**
   * Set room name input value
   * @param {string} value - Value to set
   */
  function setRoomNameInput(value) {
    elements.roomNameInput.value = value;
  }
  
  /**
   * Show a toast message
   * @param {string} message - Message to show
   * @param {string} type - 'success', 'error', or 'info'
   */
  function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-600' : 
      type === 'error' ? 'bg-red-600' : 
      'bg-gray-700'
    } text-white`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
  
  /**
   * Download JSON export
   * @param {object} data - Data to export
   * @param {string} filename - Filename
   */
  function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Set loading state on a button
   * @param {HTMLElement} btn - Button element
   * @param {boolean} loading - Loading state
   */
  function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Loading...';
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }
  
  // Public API
  return {
    init,
    elements,
    showHomeScreen,
    showRoomScreen,
    showJoinError,
    hideJoinError,
    renderUsers,
    renderLog,
    copyRoomCode,
    getDiceInput,
    setDiceInput,
    getNoteInput,
    clearNoteInput,
    getRoomCodeInput,
    getUserNameInput,
    getRoomNameInput,
    setRoomNameInput,
    showToast,
    downloadJSON,
    setButtonLoading,
    showEditRollModal,
    showInsertNoteModal
  };
})();
