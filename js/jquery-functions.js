$("document").ready(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  var serviceData        = null;   // the full parsed JSON
  var questionsMap       = {};     // id → question object  (for O(1) look-up)
  var currentQuestionId  = null;   // id of the question currently shown
  var history            = [];     // stack of question ids (for Back button)
  var historyChoices     = [];     // stack of chosen option objects (parallel to history)
  var collectedEvidences = {};     // evidence text → true  (deduplication)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function hideFormBtns() {
    $("#nextQuestion").hide();
    $("#backButton").hide();
  }

  /**
   * Load the single service JSON.
   * Change the path below if your file lives elsewhere.
   */
  function loadServiceData() {
    return fetch("question-utils/service.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        serviceData = data;

        // Build a fast id → question look-up map
        data.questions.forEach(function (q) {
          questionsMap[q.id] = q;
        });
      })
      .catch(function (err) {
        console.error("Failed to fetch service.json:", err);
        $(".question-container").html(
          "<div class='govgr-error-summary'>Σφάλμα: Αδυναμία φόρτωσης ερωτηματολογίου.</div>"
        );
        hideFormBtns();
      });
  }

  // ── Render a question ──────────────────────────────────────────────────────
  function loadQuestion(questionId, noError) {
    currentQuestionId = questionId;
    var question = questionsMap[questionId];

    $("#nextQuestion").show();
    if (history.length > 0) {
      $("#backButton").show();
    } else {
      $("#backButton").hide();
    }

    var optionsHtml = question.options
      .map(function (opt) {
        return (
          "<div class='govgr-radios__item'>" +
            "<label class='govgr-label govgr-radios__label'>" +
              opt.option_text +
              "<input class='govgr-radios__input' type='radio'" +
              " name='question-option' value='" + opt.id + "' />" +
            "</label>" +
          "</div>"
        );
      })
      .join("");

    var questionElement = document.createElement("div");

    if (noError) {
      questionElement.innerHTML =
        "<div class='govgr-field'>" +
          "<fieldset class='govgr-fieldset' aria-describedby='radio-country'>" +
            "<legend role='heading' aria-level='1'" +
              " class='govgr-fieldset__legend govgr-heading-l'>" +
              question.question_text +
            "</legend>" +
            "<div class='govgr-radios' id='radios-" + questionId + "'>" +
              "<ul>" + optionsHtml + "</ul>" +
            "</div>" +
          "</fieldset>" +
        "</div>";
    } else {
      questionElement.innerHTML =
        "<div class='govgr-field govgr-field__error' id='field-error'>" +
          "<legend role='heading' aria-level='1'" +
            " class='govgr-fieldset__legend govgr-heading-l'>" +
            question.question_text +
          "</legend>" +
          "<fieldset class='govgr-fieldset' aria-describedby='radio-error'>" +
            "<legend class='govgr-fieldset__legend govgr-heading-m'>" +
              "Επιλέξτε την απάντησή σας" +
            "</legend>" +
            "<p class='govgr-hint'>Μπορείτε να επιλέξετε μόνο μία επιλογή.</p>" +
            "<div class='govgr-radios' id='radios-" + questionId + "'>" +
              "<p class='govgr-error-message'>" +
                "<span class='govgr-visually-hidden'>Λάθος:</span>" +
                " Πρέπει να επιλέξετε μια απάντηση" +
              "</p>" +
              optionsHtml +
            "</div>" +
          "</fieldset>" +
        "</div>";
    }

    $(".question-container").html(questionElement);
  }

  // ── Termination screen ─────────────────────────────────────────────────────
  function skipToEnd(message) {
    var errorEnd = document.createElement("h5");
    errorEnd.className = "govgr-error-summary";
    errorEnd.textContent =
      "Λυπούμαστε αλλά δεν δικαιούστε το δελτίο μετακίνησης ΑΜΕΑ! " + message;
    $(".question-container").html(errorEnd);
    hideFormBtns();
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  function submitForm() {
    var resultWrapper = document.createElement("div");
    resultWrapper.setAttribute("id", "resultWrapper");
    resultWrapper.innerHTML = "<h1 class='answer'>Είστε δικαιούχος!</h1>";
    $(".question-container").html(resultWrapper);

    $(".question-container").append(
      "<br /><br /><h5 class='answer'>Τα δικαιολογητικά που πρέπει να " +
      "προσκομίσετε για να λάβετε το δελτίο μετακίνησης είναι τα εξής:</h5><br />"
    );

    var evidenceList = document.createElement("ol");
    evidenceList.setAttribute("id", "evidences");

    // Render deduplicated evidences collected during the quiz
    Object.keys(collectedEvidences).forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      evidenceList.appendChild(li);
    });

    $(".question-container").append(evidenceList);
    hideFormBtns();
  }

  // ── Collect evidences from a chosen option ─────────────────────────────────
  function collectEvidences(option) {
    if (option.evidences && option.evidences.length > 0) {
      option.evidences.forEach(function (ev) {
        collectedEvidences[ev.required_evidence] = true;
      });
    }
  }

  // ── Start button ───────────────────────────────────────────────────────────
  $("#startBtn").click(function () {
    $("#intro").html("");
    $("#languageBtn").hide();
    $("#questions-btns").show();
  });

  // ── Next button ────────────────────────────────────────────────────────────
  $("#nextQuestion").click(function () {
    if (!$(".govgr-radios__input").is(":checked")) {
      // No option selected → show error state for same question
      loadQuestion(currentQuestionId, false);
      return;
    }

    var selectedOptionId = parseInt(
      $('input[name="question-option"]:checked').val()
    );

    var question       = questionsMap[currentQuestionId];
    var selectedOption = question.options.find(function (o) {
      return o.id === selectedOptionId;
    });

    // Collect any evidences attached to this answer
    collectEvidences(selectedOption);

    // ── Terminate path ─────────────────────────────────────────────────────
    if (selectedOption.terminate) {
      skipToEnd(selectedOption.termination_reason || "");
      return;
    }

    // ── End of quiz (next_step is null) ────────────────────────────────────
    if (selectedOption.next_step === null) {
      submitForm();
      return;
    }

    // ── Continue to next question ──────────────────────────────────────────
    history.push(currentQuestionId);
    historyChoices.push(selectedOption);
    loadQuestion(selectedOption.next_step, true);
  });

  // ── Back button ────────────────────────────────────────────────────────────
  $("#backButton").click(function () {
    if (history.length > 0) {
      // Discard the choice made on the current question
      historyChoices.pop();

      var prevId = history.pop();

      // Rebuild collected evidences from scratch using the remaining history
      collectedEvidences = {};
      historyChoices.forEach(function (opt) {
        collectEvidences(opt);
      });

      loadQuestion(prevId, true);
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  $("#questions-btns").hide();

  loadServiceData().then(function () {
    if (serviceData && serviceData.questions.length > 0) {
      currentQuestionId = serviceData.questions[0].id;
      loadQuestion(currentQuestionId, true);
    }
  });
});