// ==UserScript==
// @name         Gerrit Review Checklist 2.0
// @namespace    https://github.com/mziwisky/gerrit-checklist
// @version      2.0.0
// @description  Add a checklist to your Gerrit review panel, and record responses with your submitted comments.
// @match        https://gerrit.instructure.com/*
// @copyright    2014+ Michael Ziwisky, 2019+ Kyle Grinstead
// ==/UserScript==

// example .gerrit-checklist.json file
// this file should be in the root directory of the repo
//
// {
//   "checklist": [
//     "FE: works in a mobile browser",
//     "BE: queries are optimized"
//   ],
//  "defaultStatus": false // a default status of false == Not Checked, true == Checked, null == N/A
// }

function ReviewChecklistManager(optsList, defaultStatus) {
  console.log('Gerrit review checklist added!');
  const mgr = this;
  this.options = optsList.map(function(opt) {
    const option = {
      text: opt,
      status: defaultStatus,
      setStatus: function(status) {
        this.status = status;
        mgr.updateManagedTextArea();
      },
    };
    return option;
  });
  this.isPolyGerrit = !!document.querySelector('gr-app');
  this.textAreaDomSelector = this.isPolyGerrit
    ? 'gr-reply-dialog gr-textarea textarea'
    : '.popupContent .gwt-TextArea';
}

function buildElement(tag, options) {
  const element = document.createElement(tag);
  Object.keys(options || {}).forEach(function(optionKey) {
    if (options[optionKey] !== null) {
      element[optionKey] = options[optionKey];
    }
  });
  return element;
}

ReviewChecklistManager.create = function(defaultOptsList) {
  if (ReviewChecklistManager.instanceCreated) {
    console.log('Only a single Gerrit checklist is allowed.');
    return;
  }
  ReviewChecklistManager.instanceCreated = true;

  const repoName = document.location.toString().match(/\/c\/(.*)\/\+/)[1];
  fetch(
    `https://gerrit.instructure.com/plugins/gitiles/${repoName}/+show/master/.review-checklist.json?format=text`,
  )
    .then(function(res) {
      return res.text().then(function(base64) {
        if (base64 && base64 !== '') {
          const customSettings = JSON.parse(atob(base64));
          const { checklist, defaultStatus } = customSettings;
          new ReviewChecklistManager(checklist, defaultStatus).activate();
        } else {
          new ReviewChecklistManager(defaultOptsList, null).activate();
        }
      });
    })
    .catch(function() {
      new ReviewChecklistManager(defaultOptsList, null).activate();
    });
};

ReviewChecklistManager.prototype.activate = function() {
  new MutationObserver(this.domChangeListener.bind(this)).observe(
    document.body,
    {childList: true, subtree: true},
  );
};

ReviewChecklistManager.prototype.domChangeListener = function() {
  const gerTextArea = document.querySelector(this.textAreaDomSelector);

  if (!gerTextArea) return; // review popover is not open

  this.manageTextArea(gerTextArea);
  if (!this.optionsPresent()) {
    this.insertOptions();
  }
};

ReviewChecklistManager.prototype.manageTextArea = function(gerTextArea) {
  if (this.gerTextArea && this.gerTextArea === gerTextArea) return;
  if (!this.textArea) {
    this.createStandinTextArea();
  }

  this.gerTextArea = gerTextArea;
  this.textArea.value = '';
  if (this.isPolyGerrit) {
    gerTextArea.parentElement.parentElement.style.minHeight = '11em';
    gerTextArea.parentElement.parentElement.style.overflow = 'scroll';
  } else {
    gerTextArea.parentElement.parentElement.style.maxHeight = 'none'; // let gray bg grow to fit new checkboxes
  }
  gerTextArea.parentElement.insertBefore(
    this.textArea,
    gerTextArea.nextSibling,
  );
  gerTextArea.style.position = 'fixed';
  gerTextArea.style.left = '-10000px'; // like hide(), but allows it to get focus
  const ta = this.textArea;
  gerTextArea.addEventListener('focus', function() {
    ta.focus();
  });
  this.updateManagedTextArea();
};

ReviewChecklistManager.prototype.createStandinTextArea = function() {
  let textAreaOptions;
  if (this.isPolyGerrit) {
    textAreaOptions = {
      autocomplete: true,
      placeholder: 'Say something nice...',
      style: 'height: inherit;',
      rows: 4,
    };
  } else {
    textAreaOptions = {
      rows: 5,
      cols: 70,
    };
  }
  this.textArea = buildElement('textarea', textAreaOptions);
  this.textArea.classList.add('style-scope', 'iron-autogrow-textarea');

  this.textArea.addEventListener(
    'change',
    this.updateManagedTextArea.bind(this),
  );
  this.textArea.addEventListener(
    'input',
    this.updateManagedTextArea.bind(this),
  );

  // forward special key sequences to the original textArea to get special behaviors
  const mgr = this;
  this.textArea.addEventListener('keydown', function(evt) {
    if (
      (evt.which == 13 && evt.ctrlKey) || // ctrl-Enter
      evt.which == 27
    ) {
      // esc
      mgr.gerTextArea.focus();
      mgr.gerTextArea.trigger(evt);
    }
  });
};

ReviewChecklistManager.prototype.updateManagedTextArea = function() {
  if (!this.gerTextArea) return;
  this.gerTextArea.value = '' + this.textArea.value + this.checklistText();
  this.gerTextArea.dispatchEvent(new Event('input', {bubbles: true}));
};

ReviewChecklistManager.prototype.insertOptions = function() {
  this.textArea.parentElement.appendChild(buildElement('hr'));
  this.textArea.parentElement.appendChild(this.optionsTable());
};

ReviewChecklistManager.prototype.optionsTable = function() {
  if (!this._optionsTable) {
    this._optionsTable = this.buildOptionsTable();
  }
  return this._optionsTable;
};

ReviewChecklistManager.prototype.checklistText = function() {
  const positive = [];
  const negative = [];
  this.options.forEach(function(option) {
    if (option.status === true) positive.push(option.text);
    else if (option.status === false) negative.push(option.text);
  });

  let message = '';

  if (positive.length > 0) {
    message += '\n\n  Reviewer checked:';
    positive.forEach(function(pos) {
      message += '\n   * ' + pos;
    });
  }
  if (negative.length > 0) {
    message += '\n\n  Reviewer DID NOT check:';
    negative.forEach(function(neg) {
      message += '\n   * ' + neg;
    });
  }

  return message;
};

ReviewChecklistManager.prototype.buildOptionsTable = function() {
  const headers = ['N/A', 'no', 'yes'];
  const statuses = [null, false, true];

  const rows = this.options.map(function(option, index) {
    const tr = buildElement('tr');
    statuses.forEach(function(val) {
      const box = buildElement('input', {
        type: 'radio',
        name: 'checkbox_' + index,
        checked: val === option.status ? 'checked' : null,
      });
      box.addEventListener('change', function() {
        option.setStatus(val);
      });
      const td = buildElement('td');
      td.appendChild(box);
      tr.appendChild(td);
    });
    const td = buildElement('td', {
      align: 'left',
      style: 'vertical-align: middle; padding-left: 5px; font-size: 0.9em',
      textContent: option.text,
    });
    tr.appendChild(td);
    return tr;
  });

  const headerRow = buildElement('tr');
  headers.forEach(function(text) {
    const th = buildElement('th', {align: 'center', textContent: text});
    headerRow.appendChild(th);
  });
  const firstTh = buildElement('th', {textContent: 'Did you verify:'});
  headerRow.appendChild(firstTh);
  const thead = buildElement('thead');
  thead.appendChild(headerRow);

  const tbody = buildElement('tbody', {id: 'review-checklist'});
  rows.forEach(function(row) {
    tbody.appendChild(row);
  });

  const table = buildElement('table', {cellSpacing: 8, cellPadding: 0});
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
};

ReviewChecklistManager.prototype.optionsPresent = function() {
  return !!document.querySelector('#review-checklist');
};

ReviewChecklistManager.create([
  'Changeset checked out and tried',
  'Commit message test plan is sufficient for manual sanity checking',
  'Automated tests cover all necessary cases',
  'User-facing strings/dates/times/numbers are internationalized',
  'UI interactions are accessible to screen reader, keyboard only, and visually impaired users',
]);
