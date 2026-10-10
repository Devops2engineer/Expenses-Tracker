const STORAGE_KEY = "saveflow-goals";
const DATA_FILE_PATH = "./Assets/data.json";

let goals = [];
let currentCurrency = localStorage.getItem("currency") || "GBP";

// Refresh Lucide icons
function refreshIcons() {
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function saveGoalsToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

function exportGoalsToFile() {
    saveGoalsToStorage();

    const payload = JSON.stringify({ goals }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function normalizeGoals(data) {
    const source = Array.isArray(data) ? data : data && Array.isArray(data.goals) ? data.goals : [];
    return source.filter(goal => goal && typeof goal === "object").map((goal, index) => {
        const targetAmount = Number(goal.targetAmount);
        const deposits = Array.isArray(goal.deposits) ? goal.deposits
            .filter(deposit => deposit && typeof deposit === "object")
            .map((deposit, depositIndex) => ({
                id: deposit.id ?? `${goal.id ?? index}-${depositIndex}`,
                amount: Number(deposit.amount),
                date: typeof deposit.date === "string" ? deposit.date : "",
                note: typeof deposit.note === "string" ? deposit.note : "Deposit"
            }))
            .filter(deposit => Number.isFinite(deposit.amount) && deposit.amount > 0) : [];
        return {
            ...goal,
            id: goal.id ?? Date.now() + index,
            name: typeof goal.name === "string" ? goal.name.trim() : "",
            targetAmount,
            deadline: typeof goal.deadline === "string" && goal.deadline ? goal.deadline : null,
            priority: Boolean(goal.priority),
            icon: typeof goal.icon === "string" && goal.icon ? goal.icon : "target",
            deposits
        };
    }).filter(goal => goal.name && Number.isFinite(goal.targetAmount) && goal.targetAmount > 0);
}

async function loadGoalsFromJSON() {
    const savedGoals = localStorage.getItem(STORAGE_KEY);
    if (savedGoals !== null) {
        try {
            const parsedGoals = JSON.parse(savedGoals);
            if (!Array.isArray(parsedGoals)) throw new Error("Saved goals must be an array.");
            goals = normalizeGoals(parsedGoals);
            saveGoalsToStorage();
            loadGoals();
            return;
        } catch (error) {
            console.warn("Saved goals were invalid, reloading from data.json.", error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    try {
        const response = await fetch(DATA_FILE_PATH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        goals = normalizeGoals(await response.json());
        saveGoalsToStorage();
    } catch (error) {
        console.error("Could not load goals from data.json:", error);
        goals = [];
    }
    loadGoals();
}

let currentFilter = "all";
let currentSort = "deadline";

const FALLBACK_EXCHANGE_RATES = {
    GBP: 1, USD: 1.35, EUR: 1.16, AED: 4.96, CAD: 1.84,
    AUD: 2.09, INR: 114, NGN: 2150, JPY: 200
};
let exchangeRates = { ...FALLBACK_EXCHANGE_RATES };
const EXCHANGE_RATE_CACHE_KEY = "saveflow-exchange-rates";
const EXCHANGE_RATE_CACHE_AGE = 12 * 60 * 60 * 1000;

function restoreCachedExchangeRates() {
    try {
        const cached = JSON.parse(localStorage.getItem(EXCHANGE_RATE_CACHE_KEY) || "null");
        if (!cached || !cached.rates || typeof cached.rates !== "object") return 0;
        Object.keys(FALLBACK_EXCHANGE_RATES).forEach(code => {
            const rate = Number(cached.rates[code]);
            if (code === "GBP") exchangeRates.GBP = 1;
            else if (Number.isFinite(rate) && rate > 0) exchangeRates[code] = rate;
        });
        return Number(cached.fetchedAt) || 0;
    } catch (error) {
        console.warn("Could not read cached exchange rates.", error);
        return 0;
    }
}

async function refreshExchangeRates() {
    const cachedAt = restoreCachedExchangeRates();
    if (cachedAt && Date.now() - cachedAt < EXCHANGE_RATE_CACHE_AGE) return;
    try {
        const response = await fetch("https://api.frankfurter.dev/v2/rates?base=GBP&quotes=USD,EUR,AED,CAD,AUD,INR,NGN,JPY");
        if (!response.ok) throw new Error(`Exchange-rate request failed with HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length === 0) throw new Error("The exchange-rate service returned no rates.");
        let updatedCount = 0;
        rows.forEach(row => {
            const rate = Number(row.rate);
            if (row.base === "GBP" && Object.prototype.hasOwnProperty.call(FALLBACK_EXCHANGE_RATES, row.quote) && Number.isFinite(rate) && rate > 0) {
                exchangeRates[row.quote] = rate;
                updatedCount += 1;
            }
        });
        if (!updatedCount) throw new Error("No supported exchange rates were returned.");
        exchangeRates.GBP = 1;
        localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify({
            rates: exchangeRates,
            date: rows.map(row => row.date).filter(Boolean).sort().pop() || null,
            fetchedAt: Date.now()
        }));
        refreshCurrencyDisplays();
    } catch (error) {
        console.warn("Using fallback exchange rates because current rates could not be loaded.", error);
    }
}

function getCurrentGoalFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id !== null) return goals.find(goal => String(goal.id) === id) || null;
    const fundKey = document.body.dataset.fund;
    if (!fundKey) return null;
    const legacyNames = { emergency: "Emergency Fund", holiday: "Holiday Fund", "new-laptop": "New Laptop", "gaming-setup": "Gaming Setup" };
    const expectedName = legacyNames[fundKey];
    const normalizedKey = fundKey.toLowerCase();
    return goals.find(goal => {
        const slug = String(goal.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return slug === normalizedKey || (expectedName && goal.name.toLowerCase() === expectedName.toLowerCase());
    }) || null;
}

function renderFundDetailPage() {
    const container = document.getElementById("fundDetailContent");
    if (!container) return;
    const goal = getCurrentGoalFromLocation();
    if (!goal) {
        container.innerHTML = `<div class="fund-detail-shell"><div class="fund-detail-card">
            <h1>Goal not found</h1><p>This goal may have been deleted or the link may be outdated.</p>
            <a class="page-action-btn" href="savings.html">Back to Savings</a>
        </div></div>`;
        refreshIcons();
        return;
    }

    const saved = calculateGoalSavings(goal);
    const target = Number(goal.targetAmount);
    const remaining = calculateRemaining(goal);
    const progress = calculateProgress(goal);
    const completed = progress >= 100;
    const deposits = [...(goal.deposits || [])].sort((first, second) => new Date(second.date) - new Date(first.date));
    const badge = completed
        ? '<span class="fund-badge completed-badge"><i data-lucide="circle-check" aria-hidden="true"></i> Completed</span>'
        : goal.priority
            ? '<span class="fund-badge priority-badge"><i data-lucide="star" aria-hidden="true"></i> Priority</span>'
            : '<span class="fund-badge in-progress-badge"><i data-lucide="clock-3" aria-hidden="true"></i> In progress</span>';
    const depositRows = deposits.length ? deposits.map(deposit => `
        <div class="deposit-item"><div><strong>${escapeHTML(formatDeadline(deposit.date))}</strong>
        <span>${escapeHTML(deposit.note || "Deposit")}</span></div><strong>${formatCurrency(deposit.amount)}</strong></div>
    `).join("") : '<p class="deposit-list-empty">No deposits yet.</p>';
    const highestDeposit = Math.max(0, ...deposits.map(deposit => Number(deposit.amount) || 0));

    container.innerHTML = `
        <div class="fund-detail-shell">
            <div class="fund-header-row"><div><span class="page-label">Savings Goal</span>
                <h1>${escapeHTML(goal.name)}</h1><p>Review your progress, track deposits, and manage this goal in one place.</p></div>
                <button class="create-goal-btn back-to-savings-btn" type="button"><i data-lucide="arrow-left" aria-hidden="true"></i> Back to Savings</button>
            </div>
            <article class="fund-detail-card">
                <div class="fund-summary-row"><div class="fund-icon-wrap"><i data-lucide="${escapeHTML(goal.icon || "target")}" aria-hidden="true"></i></div>
                    <div class="fund-summary-copy"><div class="fund-title-row"><h2>${escapeHTML(goal.name)}</h2>${badge}</div>
                        <p>${formatCurrency(saved)} saved of ${formatCurrency(target)}</p>
                        <div class="goal-mini-progress"><div class="goal-mini-progress-bar"><div class="goal-mini-progress-fill ${completed ? "completed-fill" : ""}" style="width: ${progress}%"></div></div><span>${Math.round(progress)}%</span></div>
                    </div>
                </div>
                <div class="goal-details-top"><div class="detail-card"><span>Amount saved</span><strong>${formatCurrency(saved)}</strong></div>
                    <div class="detail-card"><span>Target amount</span><strong>${formatCurrency(target)}</strong></div>
                    <div class="detail-card"><span>Remaining</span><strong>${formatCurrency(remaining)}</strong></div>
                </div>
                <div class="full-progress-section"><div class="detail-heading-row"><h4>Goal Progress</h4><strong>${Math.round(progress)}%</strong></div>
                    <div class="full-progress-bar"><div class="full-progress-fill ${completed ? "completed-fill" : ""}" style="width: ${progress}%"></div></div>
                </div>
                <div class="goal-information"><div><span>${completed ? "Completed" : "Deadline"}</span><strong>${escapeHTML(formatDeadline(goal.deadline))}</strong></div>
                    <div><span>Total deposits</span><strong>${deposits.length}</strong></div>
                    <div><span>Highest deposit</span><strong>${formatCurrency(highestDeposit)}</strong></div>
                </div>
                <div class="deposit-history"><div class="detail-heading-row"><h4>Deposit History</h4><span>${deposits.length} ${deposits.length === 1 ? "deposit" : "deposits"}</span></div><div class="deposit-list">${depositRows}</div></div>
                <div class="goal-actions"><button class="deposit-now-btn goal-detail-deposit-btn" type="button"><i data-lucide="wallet" aria-hidden="true"></i> Deposit Now</button>
                    <button class="edit-goal-btn goal-detail-edit-btn" type="button"><i data-lucide="pencil" aria-hidden="true"></i> Edit Goal</button></div>
                <p class="goal-message">${completed ? "Congratulations! You have reached this savings target." : "Every deposit brings you closer to your goal."}</p>
            </article>
        </div>`;
    container.querySelector(".back-to-savings-btn")?.addEventListener("click", () => window.location.href = "savings.html");
    container.querySelector(".goal-detail-deposit-btn")?.addEventListener("click", () => depositToGoal(goal));
    container.querySelector(".goal-detail-edit-btn")?.addEventListener("click", () => editGoal(goal));
    refreshIcons();
}

function renderEditGoalPage() {
    const container = document.getElementById("editGoalContent");
    if (!container) return;
    const params = new URLSearchParams(window.location.search);
    let goal = getCurrentGoalFromLocation();
    if (!goal && params.has("fund")) {
        const aliases = { emergency: "Emergency Fund", holiday: "Holiday Fund", "new-laptop": "New Laptop", "gaming-setup": "Gaming Setup" };
        const expectedName = aliases[params.get("fund")];
        if (expectedName) goal = goals.find(item => item.name.toLowerCase() === expectedName.toLowerCase()) || null;
    }
    if (!goal) {
        container.innerHTML = `<div class="fund-detail-shell"><div class="fund-detail-card">
            <h1>Goal not found</h1><p>Choose a goal from your savings page before editing it.</p>
            <a class="page-action-btn" href="savings.html">Back to Savings</a>
        </div></div>`;
        return;
    }

    const displayTarget = Number(convertCurrency(goal.targetAmount).toFixed(2));
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(goal.deadline || "") ? goal.deadline : "";
    container.innerHTML = `
        <div class="fund-detail-shell">
            <div class="fund-header-row"><div><span class="page-label">Edit Goal</span><h1>${escapeHTML(goal.name)}</h1><p>Update your target details and save the changes.</p></div>
                <button class="create-goal-btn back-to-savings-btn" type="button"><i data-lucide="arrow-left" aria-hidden="true"></i> Back to Savings</button>
            </div>
            <article class="fund-detail-card form-card"><form id="editGoalForm" class="goal-edit-form">
                <div class="form-grid">
                    <label><span>Goal name</span><input type="text" name="goalName" value="${escapeHTML(goal.name)}" maxlength="100" required></label>
                    <label><span>Target amount (${escapeHTML(currentCurrency)})</span><input type="number" name="goalTarget" value="${displayTarget}" min="0.01" step="0.01" required></label>
                    <label><span>Deadline</span><input type="date" name="goalDeadline" value="${deadline}"></label>
                    <label><span>Priority goal</span><select name="goalPriority">
                        <option value="yes" ${goal.priority ? "selected" : ""}>Yes</option>
                        <option value="no" ${!goal.priority ? "selected" : ""}>No</option>
                    </select></label>
                </div>
                <div class="form-actions"><button type="submit" class="save-goal-btn">Save Changes</button>
                    <button type="button" class="secondary-action edit-cancel-btn">Cancel</button></div>
            </form></article>
        </div>`;

    const form = document.getElementById("editGoalForm");
    form?.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(form);
        const updatedName = String(formData.get("goalName") || "").trim();
        const enteredTarget = Number(formData.get("goalTarget"));
        if (!updatedName || !Number.isFinite(enteredTarget) || enteredTarget <= 0) {
            alert("Please enter a valid goal name and target amount.");
            return;
        }
        goal.name = updatedName;
        goal.targetAmount = convertToBaseCurrency(enteredTarget);
        goal.deadline = String(formData.get("goalDeadline") || "") || null;
        const isPriority = formData.get("goalPriority") === "yes";
        goal.priority = isPriority;
        if (isPriority) goals.forEach(item => {
            if (String(item.id) !== String(goal.id)) item.priority = false;
        });
        saveGoalsToStorage();
        window.location.href = getGoalPage(goal);
    });
    container.querySelector(".edit-cancel-btn")?.addEventListener("click", () => window.location.href = getGoalPage(goal));
    container.querySelector(".back-to-savings-btn")?.addEventListener("click", () => window.location.href = "savings.html");
    refreshIcons();
}

// Load savings goals
function loadGoals() {
    saveGoalsToStorage();
    updateDashboard();
    renderGoals();
    renderChart();
    updateChartCurrency();
    if (document.body.dataset.fund || document.body.dataset.page === "goal-details") renderFundDetailPage();
    if (document.body.dataset.page === "edit-goal") renderEditGoalPage();
}

// Convert GBP into selected currency
function convertCurrency(amount) {
    const rate = Number(exchangeRates[currentCurrency]) || 1;
    return Number(amount) * rate;
}

function convertToBaseCurrency(amount) {
    const rate = Number(exchangeRates[currentCurrency]) || 1;
    return Number(amount) / rate;
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat("en", {
        style: "currency",
        currency: currentCurrency,
        maximumFractionDigits: 2
    }).format(convertCurrency(amount));
}

// Change selected currency
function changeCurrency() {
    const currencySelect = document.getElementById("currencySelect");
    if (!currencySelect) return;
    currentCurrency = currencySelect.value;
    localStorage.setItem("currency", currentCurrency);
    refreshCurrencyDisplays();
    if (document.body.dataset.page === "edit-goal") {
        const goal = getCurrentGoalFromLocation();
        const input = document.querySelector('#editGoalForm [name="goalTarget"]');
        if (goal && input && document.activeElement !== input) input.value = Number(convertCurrency(goal.targetAmount).toFixed(2));
    }
}

// Set saved currency
function setupCurrencySelector() {
    const currencySelect = document.getElementById("currencySelect");
    if (!currencySelect) return;
    if (!Object.prototype.hasOwnProperty.call(FALLBACK_EXCHANGE_RATES, currentCurrency)) currentCurrency = "GBP";
    currencySelect.value = currentCurrency;
    currencySelect.addEventListener("change", changeCurrency);
}

function refreshCurrencyDisplays() {
    updateDashboard();
    renderGoals();
    renderChart();
    updateChartCurrency();
    renderTransactions();
    updateTransactionSummary();
    if (document.body.dataset.fund || document.body.dataset.page === "goal-details") renderFundDetailPage();
}

// Calculate total savings
function calculateTotalSavings() {
    let total = 0;

    goals.forEach(goal => {
        total += calculateGoalSavings(goal);
    });

    return total;
}

// Calculate savings for one goal
function calculateGoalSavings(goal) {
    if (!Array.isArray(goal.deposits)) return 0;
    return goal.deposits.reduce((total, deposit) => {
        const amount = Number(deposit.amount);
        return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
}

function calculateRemaining(goal) {
    const saved = calculateGoalSavings(goal);
    const target = Number(goal.targetAmount);

    return Math.max(target - saved, 0);
}

// Calculate progress percentage
function calculateProgress(goal) {
    const saved = calculateGoalSavings(goal);
    const target = Number(goal.targetAmount);

    if (target <= 0) {
        return 0;
    }

    return Math.min((saved / target) * 100, 100);
}

// Count active goals
function getActiveGoals() {
    return goals.filter(goal => calculateProgress(goal) < 100).length;
}

// Count completed goals
function getCompletedGoals() {
    return goals.filter(goal => calculateProgress(goal) >= 100).length;
}

// Update dashboard statistics
function updateDashboard() {
    const totalSavingsElement = document.getElementById("totalSavings");
    const activeGoalsElement = document.getElementById("activeGoals");
    const completedGoalsElement = document.getElementById("completedGoals");

    if (totalSavingsElement) {
        totalSavingsElement.textContent =
            formatCurrency(calculateTotalSavings());
    }

    if (activeGoalsElement) {
        activeGoalsElement.textContent = getActiveGoals();
    }

    if (completedGoalsElement) {
        completedGoalsElement.textContent = getCompletedGoals();
    }

    updateCurrencyLabels();
}

// Update hardcoded currency labels
function updateCurrencyLabels() {
    const statIcons = document.querySelectorAll(".stat-icon");

    statIcons.forEach(icon => {
        if (icon.textContent.trim() === "£") {
            icon.textContent = currentCurrency;
        }
    });
}

// Format a deadline
function formatDeadline(deadline) {
    if (!deadline) {
        return "No deadline";
    }

    const date = new Date(deadline);

    if (isNaN(date.getTime())) {
        return "No deadline";
    }

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Get filtered goals
function getFilteredGoals() {
    if (currentFilter === "active") {
        return goals.filter(goal => calculateProgress(goal) < 100);
    }

    if (currentFilter === "completed") {
        return goals.filter(goal => calculateProgress(goal) >= 100);
    }

    return [...goals];
}

// Sort goals
function sortGoals(goalList) {
    return goalList.sort((firstGoal, secondGoal) => {
        if (currentSort === "deadline") {
            if (!firstGoal.deadline && !secondGoal.deadline) {
                return 0;
            }

            if (!firstGoal.deadline) {
                return 1;
            }

            if (!secondGoal.deadline) {
                return -1;
            }

            return new Date(firstGoal.deadline) -
                new Date(secondGoal.deadline);
        }

        if (currentSort === "progress") {
            return calculateProgress(secondGoal) -
                calculateProgress(firstGoal);
        }

        if (currentSort === "amount") {
            return calculateGoalSavings(secondGoal) -
                calculateGoalSavings(firstGoal);
        }

        if (currentSort === "alphabetical") {
            return firstGoal.name.localeCompare(secondGoal.name);
        }

        return 0;
    });
}

// Create one goal card
function createGoalCard(goal) {
    const saved = calculateGoalSavings(goal);
    const progress = calculateProgress(goal);
    const completed = progress >= 100;

    const card = document.createElement("article");

    card.className = "goal-card";

    if (completed) {
        card.classList.add("completed");
    }

    card.innerHTML = `
        ${
            completed
                ? `<div class="completed-badge">Completed</div>`
                : ""
        }

        <div class="goal-card-header">

            <h3>${escapeHTML(goal.name)}</h3>

            <button
                class="more-btn"
                type="button"
                aria-label="More options for ${escapeHTML(goal.name)}">
                ⋮
            </button>

        </div>

        <div class="goal-amount">
            <strong>${formatCurrency(saved)}</strong>
            <span>of ${formatCurrency(goal.targetAmount)}</span>
        </div>

        <div class="progress-container">

            <div class="progress-bar">
                <div
                    class="progress"
                    style="width: ${progress}%;">
                </div>
            </div>

            <span class="progress-percent">
                ${Math.round(progress)}%
            </span>

        </div>

        <div class="goal-footer">

            <div>
                <span class="label">
                    ${completed ? "Completed" : "Deadline"}
                </span>

                <strong>
                    ${
                        completed
                            ? "Goal reached!"
                            : formatDeadline(goal.deadline)
                    }
                </strong>
            </div>

            <button class="view-btn" type="button">
                View Details
            </button>

        </div>
    `;

    const viewButton = card.querySelector(".view-btn");
    const moreButton = card.querySelector(".more-btn");

    viewButton.addEventListener("click", () => {
        window.location.href = getGoalPage(goal);
    });

    moreButton.addEventListener("click", () => {
        showGoalOptions(goal);
    });

    return card;
}

// Create one expandable savings-page card
function createSavingsGoalCard(goal) {
    const saved = calculateGoalSavings(goal);
    const progress = calculateProgress(goal);
    const completed = progress >= 100;
    const deposits = [...(goal.deposits || [])].sort((first, second) =>
        new Date(second.date) - new Date(first.date)
    );
    const depositHistory = deposits.length > 0
        ? deposits.map(deposit => `
            <div class="deposit-item">
                <div>
                    <strong>${formatDeadline(deposit.date)}</strong>
                    <span>${escapeHTML(deposit.note || "Deposit")}</span>
                </div>
                <strong>${formatCurrency(deposit.amount)}</strong>
            </div>
        `).join("")
        : `<div class="deposit-list-empty">No deposits yet.</div>`;

    const card = document.createElement("article");
    card.className = "savings-goal-card";
    card.dataset.goalId = goal.id;
    card.innerHTML = `
        <button class="goal-toggle" type="button" aria-expanded="false" aria-controls="goal-details-${goal.id}">
            <div class="goal-icon"><i data-lucide="${escapeHTML(goal.icon || "target")}" aria-hidden="true"></i></div>
            <div class="goal-summary">
                <div class="goal-title-row">
                    <h3>${escapeHTML(goal.name)}</h3>
                    ${goal.priority ? `<span class="priority-badge"><i data-lucide="star"></i> Priority</span>` : ""}
                    ${completed ? `<span class="completed-badge"><i data-lucide="circle-check"></i> Completed</span>` : ""}
                </div>
                <p>${formatCurrency(saved)} saved of ${formatCurrency(goal.targetAmount)}</p>
                <div class="goal-mini-progress">
                    <div class="goal-mini-progress-bar"><div class="goal-mini-progress-fill" style="width: ${progress}%"></div></div>
                    <span>${Math.round(progress)}%</span>
                </div>
            </div>
            <span class="goal-arrow"><i data-lucide="chevron-down" aria-hidden="true"></i></span>
        </button>
        <div class="goal-details" id="goal-details-${goal.id}" hidden>
            <div class="goal-details-top">
                <div class="detail-card"><span>Amount saved</span><strong>${formatCurrency(saved)}</strong></div>
                <div class="detail-card"><span>Target amount</span><strong>${formatCurrency(goal.targetAmount)}</strong></div>
                <div class="detail-card"><span>Remaining</span><strong>${formatCurrency(calculateRemaining(goal))}</strong></div>
            </div>
            <div class="full-progress-section">
                <div class="detail-heading-row"><h4>Goal Progress</h4><strong>${Math.round(progress)}%</strong></div>
                <div class="full-progress-bar"><div class="full-progress-fill" style="width: ${progress}%"></div></div>
            </div>
            <div class="goal-information">
                <div><span>${completed ? "Completed" : "Deadline"}</span><strong>${completed ? "Goal reached!" : formatDeadline(goal.deadline)}</strong></div>
                <div><span>Total deposits</span><strong>${deposits.length}</strong></div>
                <div><span>Highest deposit</span><strong>${formatCurrency(Math.max(0, ...deposits.map(deposit => Number(deposit.amount))))}</strong></div>
            </div>
            <div class="deposit-history">
                <div class="detail-heading-row"><h4>Deposit History</h4><span>${deposits.length} ${deposits.length === 1 ? "deposit" : "deposits"}</span></div>
                <div class="deposit-list">${depositHistory}</div>
            </div>
            <div class="goal-actions">
                ${completed ? "" : `<button class="deposit-now-btn" type="button" data-goal-id="${goal.id}">Deposit Now</button>`}
                <button class="edit-goal-btn" type="button" data-goal-id="${goal.id}">Edit Goal</button>
            </div>
        </div>
    `;

    return card;
}

function createGoal() {
    const name = prompt("Enter the goal name:");
    const target = prompt(`Enter the target amount in ${currentCurrency}:`);
    const targetAmount = Number(target);
    if (!name || !name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) return;

    goals.push({
        id: Date.now(),
        name: name.trim(),
        targetAmount: convertToBaseCurrency(targetAmount),
        deadline: null,
        priority: false,
        icon: "target",
        deposits: []
    });
    saveGoalsToStorage();
    loadGoals();
}

function getGoalPage(goal) {
    return goal ? `goal-details.html?id=${encodeURIComponent(goal.id)}` : "savings.html";
}

function editGoal(goal) {
    if (!goal) {
        window.location.href = "savings.html";
        return;
    }
    window.location.href = `edit-goal.html?id=${encodeURIComponent(goal.id)}`;
}

function depositToGoal(goal) {
    if (!goal) return;
    const amount = Number(prompt(`Deposit amount for ${goal.name} in ${currentCurrency}:`));
    if (!Number.isFinite(amount) || amount <= 0) return;

    goal.deposits = Array.isArray(goal.deposits) ? goal.deposits : [];
    goal.deposits.push({
        id: Date.now(),
        amount: convertToBaseCurrency(amount),
        date: new Date().toISOString().slice(0, 10),
        note: "Deposit"
    });
    saveGoalsToStorage();
    loadGoals();
}

// Display goal cards
function renderGoals() {
    const goalGrid = document.getElementById("goalGrid");
    const emptyState = document.getElementById("emptyState");
    const goalList = document.getElementById("goalList");

    if (!goalGrid && goalList) {
        goalList.innerHTML = "";
        const visibleGoals = sortGoals(getFilteredGoals());

        visibleGoals.forEach(goal => {
            goalList.appendChild(createSavingsGoalCard(goal));
        });

        goalList.querySelectorAll(".goal-toggle").forEach(button => {
            button.addEventListener("click", () => {
                const details = button.nextElementSibling;
                const card = button.closest(".savings-goal-card");
                const isOpen = !details.hidden;

                if (!isOpen) {
                    goalList.querySelectorAll(".savings-goal-card.open").forEach(openCard => {
                        if (openCard === card) {
                            return;
                        }

                        const openDetails = openCard.querySelector(".goal-details");
                        const openToggle = openCard.querySelector(".goal-toggle");

                        openDetails.hidden = true;
                        openToggle.setAttribute("aria-expanded", "false");
                        openCard.classList.remove("open");
                    });
                }

                details.hidden = isOpen;
                button.setAttribute("aria-expanded", String(!isOpen));
                card.classList.toggle("open", !isOpen);
            });
        });

        goalList.querySelectorAll(".deposit-now-btn").forEach(button => {
            button.addEventListener("click", () => {
                const goal = goals.find(item => String(item.id) === button.dataset.goalId);
                if (goal) depositToGoal(goal);
            });
        });

        goalList.querySelectorAll(".edit-goal-btn").forEach(button => {
            button.addEventListener("click", () => {
                const goal = goals.find(item => item.id === Number(button.dataset.goalId));
                if (goal) editGoal(goal);
            });
        });

        const goalCount = document.getElementById("goalCount");
        if (goalCount) {
            goalCount.textContent = `${visibleGoals.length} ${visibleGoals.length === 1 ? "Goal" : "Goals"}`;
        }

        refreshIcons();
        return;
    }

    if (!goalGrid) {
        return;
    }

    goalGrid.innerHTML = "";

    let visibleGoals = getFilteredGoals();

    visibleGoals = sortGoals(visibleGoals);

    if (visibleGoals.length === 0) {
        if (emptyState) {
            emptyState.style.display = "block";
        }

        return;
    }

    if (emptyState) {
        emptyState.style.display = "none";
    }

    visibleGoals.forEach(goal => {
        const goalCard = createGoalCard(goal);

        goalGrid.appendChild(goalCard);
    });

    if (emptyState) {
        emptyState.style.display = visibleGoals.length === 0 ? "block" : "none";
    }
}

// View goal details
function viewGoalDetails(goal) {
    window.location.href = getGoalPage(goal);
}

// Display more options
function showGoalOptions(goal) {
    alert(`More options for ${goal.name} are coming soon.`);
}

// Setup savings filters
function setupFilters() {
    document.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => {
            currentFilter = button.dataset.filter;

            document.querySelectorAll("[data-filter]").forEach(filterButton => {
                filterButton.classList.toggle("active", filterButton === button);
            });

            renderGoals();
        });
    });
}

// Setup sorting
function setupSorting() {
    const sortSelect = document.getElementById("sortGoals");

    if (!sortSelect) {
        return;
    }

    sortSelect.addEventListener("change", () => {
        currentSort = sortSelect.value;

        renderGoals();
    });
}

// Calculate monthly deposits
function calculateMonthlyDeposits() {
    const monthlyTotals = {
        Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0,
        Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0
    };
    const reportingYear = new Date().getFullYear();

    goals.forEach(goal => {
        if (!Array.isArray(goal.deposits)) return;

        goal.deposits.forEach(deposit => {
            const date = new Date(deposit.date);
            const amount = Number(deposit.amount);
            if (Number.isNaN(date.getTime()) || date.getFullYear() !== reportingYear || !Number.isFinite(amount)) {
                return;
            }

            const month = date.toLocaleDateString("en-US", { month: "short" });
            if (Object.prototype.hasOwnProperty.call(monthlyTotals, month)) {
                monthlyTotals[month] += amount;
            }
        });
    });

    return monthlyTotals;
}

// Render monthly deposit chart
function getChartScale() {
    const values = Object.values(calculateMonthlyDeposits());
    const maximum = Math.max(...values, 1);
    return Math.max(2000, Math.ceil(maximum / 500) * 500);
}

function renderChart() {
    const chart = document.getElementById("monthlyChart");
    if (!chart) return;

    const monthlyTotals = calculateMonthlyDeposits();
    const maxValue = getChartScale();
    chart.innerHTML = "";

    Object.entries(monthlyTotals).forEach(([month, amount]) => {
        const height = Math.min(100, Math.max(0, (amount / maxValue) * 100));
        const column = document.createElement("div");
        column.className = "bar-column";

        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = `${height}%`;
        bar.title = `${month}: ${formatCurrency(amount)}`;

        const label = document.createElement("span");
        label.textContent = month;
        column.append(bar, label);
        chart.appendChild(column);
    });
}

// Update chart currency labels
function updateChartCurrency() {
    const chartYAxis = document.querySelector(".chart-y-axis");
    if (!chartYAxis) return;

    const labels = chartYAxis.querySelectorAll("span");
    const maxValue = getChartScale();
    const divisions = labels.length > 1 ? labels.length - 1 : 1;

    labels.forEach((label, index) => {
        const value = maxValue - (maxValue / divisions) * index;
        label.textContent = formatCurrency(value);
    });
}

// Prevent unsafe HTML
function escapeHTML(value) {
    const element = document.createElement("div");

    element.textContent = value;

    return element.innerHTML;
}

// Transaction tracking (merged from script2.js)

const TRANSACTIONS_KEY = "saveflow-transactions";

// Start with an empty history so demo records are not saved as real transactions.
function loadTransactions() {
    const saved = localStorage.getItem(TRANSACTIONS_KEY);
    if (saved === null) return [];
    try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(transaction => transaction && typeof transaction === "object")
            .map((transaction, index) => ({
                id: transaction.id ?? Date.now() + index,
                amount: Number(transaction.amount),
                note: typeof transaction.note === "string" ? transaction.note : "No note",
                date: typeof transaction.date === "string" ? transaction.date : ""
            }))
            .filter(transaction => Number.isFinite(transaction.amount) && transaction.amount >= 0);
    } catch (error) {
        console.warn("Saved transactions were invalid; showing an empty transaction list.", error);
        return [];
    }
}

let transactions = loadTransactions();

function renderTransactions() {
    const transactionsList = document.getElementById("transactions");
    const totalAmountEl = document.getElementById("total-amount");
    if (!transactionsList || !totalAmountEl) return;

    transactionsList.innerHTML = "";
    if (transactions.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "transaction-empty-state";
        emptyItem.textContent = "No transactions yet.";
        transactionsList.appendChild(emptyItem);
        updateTotal();
        return;
    }

    transactions.forEach(transaction => {
        const listItem = document.createElement("li");
        const details = document.createElement("span");
        details.textContent = `${formatDate(transaction.date)} — ${transaction.note}`;
        const amountSpan = document.createElement("span");
        amountSpan.textContent = formatCurrency(Number(transaction.amount) || 0);
        listItem.append(details, amountSpan);
        transactionsList.appendChild(listItem);
    });
    updateTotal();
}

function updateTotal() {
    const totalAmountEl = document.getElementById("total-amount");
    if (!totalAmountEl) return;
    const total = transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
    totalAmountEl.textContent = formatCurrency(total);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (!dateString || Number.isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function setupTransactionForm() {
    const form = document.getElementById("transaction-form");
    const errorMessage = document.getElementById("form-error");
    if (!form || !errorMessage) return;

    form.addEventListener("submit", event => {
        event.preventDefault();
        const amountInput = document.getElementById("amount");
        const noteInput = document.getElementById("note");
        const dateInput = document.getElementById("date");
        const enteredAmount = Number(amountInput.value);
        const note = noteInput.value.trim();
        const date = dateInput.value;

        if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
            errorMessage.textContent = "Please enter a valid amount greater than 0.";
            return;
        }
        if (!date) {
            errorMessage.textContent = "Please select a date.";
            return;
        }

        errorMessage.textContent = "";
        transactions.push({
            id: Date.now(),
            amount: convertToBaseCurrency(enteredAmount),
            note: note || "No note",
            date
        });
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
        window.location.href = "transactions.html";
    });
}
// ===== Account page (Elina) =====

// Load and save the user's profile (name, email) using localStorage
function setupProfileForm() {
    const profileForm = document.getElementById("profile-form");
    const fullNameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const savedMessage = document.getElementById("profile-saved-message");

    if (!profileForm || !fullNameInput || !emailInput || !savedMessage) {
        return;
    }

    // Fill the form with previously saved info
    fullNameInput.value = localStorage.getItem("profileName") || "";
    emailInput.value = localStorage.getItem("profileEmail") || "";
    updateProfileAvatar();

    profileForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = fullNameInput.value.trim();
        const email = emailInput.value.trim();

        if (!name) {
            savedMessage.textContent = "Please enter your name.";
            savedMessage.classList.add("error");
            return;
        }

        localStorage.setItem("profileName", name);
        localStorage.setItem("profileEmail", email);

        updateNavAccountName();
        updateProfileAvatar();

        savedMessage.classList.remove("error");
        savedMessage.textContent = "Profile saved!";
    });
}

// Show the saved name in the nav bar on every page
function updateNavAccountName() {
    const savedName = localStorage.getItem("profileName");

    if (!savedName) {
        return;
    }

    document.querySelectorAll(".account-name").forEach(function (element) {
        element.textContent = savedName;
    });
}

// Update the avatar letter and display name on the account page
function updateProfileAvatar() {
    const avatarEl = document.getElementById("profileAvatar");
    const displayNameEl = document.getElementById("profileDisplayName");

    if (!avatarEl || !displayNameEl) {
        return;
    }

    const name = localStorage.getItem("profileName") || "Account Name";

    avatarEl.textContent = name.charAt(0).toUpperCase();
    displayNameEl.textContent = name;
}

// Show a summary of all transactions on the account page
function updateTransactionSummary() {
    const countEl = document.getElementById("summaryTransactionCount");
    const totalEl = document.getElementById("summaryTransactionTotal");
    const latestEl = document.getElementById("summaryLatestTransaction");
    if (!countEl || !totalEl || !latestEl) return;

    const total = transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
    countEl.textContent = transactions.length;
    totalEl.textContent = formatCurrency(total);

    if (transactions.length === 0) {
        latestEl.textContent = "None yet";
        return;
    }
    const latest = [...transactions].sort((first, second) => new Date(second.date) - new Date(first.date))[0];
    latestEl.textContent = `${latest.note} — ${formatCurrency(Number(latest.amount) || 0)}`;
}

// Hide loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById("loadingScreen");

    if (!loadingScreen) {
        return;
    }

    loadingScreen.classList.add("hidden");
}

// Start SaveFlow
document.addEventListener("DOMContentLoaded", () => {
    restoreCachedExchangeRates();
    setupCurrencySelector();
    setupFilters();
    setupSorting();

    refreshIcons();

    document.querySelectorAll(".create-goal-btn:not(.back-to-savings-btn):not(.save-goal-btn)").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            createGoal();
        });
    });

    document.querySelectorAll(".view-btn[data-page]").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            window.location.href = button.dataset.page;
        });
    });

    const exportButton = document.getElementById("exportGoalsBtn");

    if (exportButton) {
        exportButton.addEventListener("click", exportGoalsToFile);
    }

    setupTransactionForm();
    renderTransactions();
    setupProfileForm();
    updateNavAccountName();
    updateTransactionSummary();
    loadGoalsFromJSON();
    refreshExchangeRates();

    // Add a short loading delay
    setTimeout(() => {
        hideLoadingScreen();
    }, 1200);
});