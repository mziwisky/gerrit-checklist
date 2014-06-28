// ==UserScript==
// @name       Gerrit Review Checklist
// @namespace  https://github.com/mziwisky/gerrit-checklist
// @version    0.0.1
// @description  Add a checklist to your Gerrit review panel, and record responses with your submitted comments.  Tested only with the "new UI" of Gerrit version 2.8.3.
// @match      https://gerrit.instructure.com/*
// @copyright  2014+, Michael Ziwisky
// ==/UserScript==

function ReviewChecklistManager(optsList) {
  console.log('Gerrit review checklist added!');
  this.optsList = optsList;
};

ReviewChecklistManager.create = function(optsList) {
  if (ReviewChecklistManager.instanceCreated) {
      console.log('Only a single Gerrit checklist is allowed.');
      return;
  }
  ReviewChecklistManager.instanceCreated = true;
    
  new ReviewChecklistManager(optsList).activate();
};

ReviewChecklistManager.prototype.activate = function() {
  this.boundDomChangeListener = this.domChangeListener.bind(this);
//  $('body').bind("DOMSubtreeModified", this.boundDomChangeListener);
  // I guess Tampermonkey or Gerrit or someone doesn't gimme jQuery at this point.
  document.getElementsByTagName('body')[0].addEventListener ('DOMSubtreeModified', this.boundDomChangeListener, false);
};

ReviewChecklistManager.prototype.domChangeListener = function() {
  var gerTextArea = $('.popupContent .gwt-TextArea');
  if (gerTextArea.length == 0) return;  // review popover is not open

  this.manageTextArea(gerTextArea);
  if (!this.optionsPresent()) this.insertOptions();
};

ReviewChecklistManager.prototype.manageTextArea = function(gerTextArea) {
  if (this.gerTextArea && this.gerTextArea[0] == gerTextArea[0]) return;
  if (!this.textArea) this.createStandinTextArea();

  this.gerTextArea = gerTextArea;
  this.textArea.val('');
  this.clearCheckboxes();
  gerTextArea.parent().parent().css('max-height', 'none'); // let gray bg grow to fit new checkboxes
  gerTextArea.after(this.textArea);
  gerTextArea.css({position: 'fixed', left: -10000}); // like hide(), but allows it to get focus
  var ta = this.textArea;
  gerTextArea.bind('focus', function() { ta.focus(); });
  this.updateManagedTextArea();
};

ReviewChecklistManager.prototype.clearCheckboxes = function() {
  if (this.checkboxes) this.checkboxes.forEach(function(box) { box.attr('checked', false); });
};

ReviewChecklistManager.prototype.createStandinTextArea = function() {
  this.textArea = $('<textarea class="standin-text-area" rows="5" cols="70">');
  this.textArea.bind('change input', this.updateManagedTextArea.bind(this));

  // forward special key sequences to the original textArea to get special behaviors
  var mgr = this;
  this.textArea.bind('keydown', function(evt) {
    if ((evt.which == 13 && evt.ctrlKey) || // ctrl-Enter
         evt.which == 27) { // esc
      mgr.gerTextArea.focus();
      mgr.gerTextArea.trigger(evt);
    }
  });
};

ReviewChecklistManager.prototype.updateManagedTextArea = function() {
  if (!this.gerTextArea) return;
  this.gerTextArea.val('' + this.textArea.val() + this.checklistText);
};

ReviewChecklistManager.prototype.insertOptions = function() {
  this.textArea.after(this.optionsTable());
};

ReviewChecklistManager.prototype.optionsTable = function() {
  var opts = this.buildOptionsTable();
  this.optionsTable = function() { return opts };
  return opts;
};

ReviewChecklistManager.prototype.updateChecklistText = function() {
  var positive = [], negative = [];
  this.optsList.forEach(function(option, index) {
    if (this.checkboxes[index].is(':checked')) positive.push(option)
    else negative.push(option)
  }, this);

  var message = '';

  if (positive.length > 0) {
    message += '\n\n  Reviewer checked:'
    positive.forEach(function(opt) { message += '\n   * ' + opt; });
  }
  if (negative.length > 0) {
    message += '\n\n  Reviewer DID NOT check:'
    negative.forEach(function(opt) { message += '\n   * ' + opt; });
  }
  this.checklistText = message;

  this.updateManagedTextArea();
};

ReviewChecklistManager.prototype.buildOptionsTable = function() {
  this.checkboxes = [];
  var rows = this.optsList.map(function(option, index) {
    var id = '"checkbox_' + index + '"';
    var box = $('<input type="checkbox" id=' + id + ' tabindex="0">');
    box.bind('change', this.updateChecklistText.bind(this));
    this.checkboxes.push(box);

    return  $('<tr>').append(
              $('<td align="left" style="vertical-align: top;">').append(
                box
              ).append(
                $('<label for=' + id + ' style="font-size: smaller; padding-left: 5px;">').append(
                  option
                )
              )
            );
  }, this);

  var tbody = $('<tbody id="review-checklist">');
  rows.forEach(function(row) {
    tbody.append(row);
  });

  this.updateChecklistText();

  return $('<table cellspacing="0" cellpadding="0">').append(tbody);
};

ReviewChecklistManager.prototype.optionsPresent = function() {
  return $('#review-checklist').length > 0;
};


ReviewChecklistManager.create([
  "Changeset checked out and tried",
  "Commit message test plan is sufficient for manual sanity checking",
  "Automated tests cover all necessary cases",
  "User-facing strings/dates/times/numbers are internationalized"
]);

