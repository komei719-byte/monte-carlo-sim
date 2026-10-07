// DOM要素の取得
const weightAInput = document.getElementById('weightA');
const weightBInput = document.getElementById('weightB');
const isCashAInput = document.getElementById('isCashA');
const isCashBInput = document.getElementById('isCashB');
const runBtn = document.getElementById('runBtn');

let chartInstance = null;

// 配分比率の自動連動 (0%～100%のクランプ処理を追加)
weightAInput.addEventListener('input', () => {
    let valA = parseFloat(weightAInput.value);
    if (isNaN(valA)) valA = 0;
    if (valA < 0) valA = 0;
    if (valA > 100) valA = 100;
    weightAInput.value = valA;
    weightBInput.value = (100 - valA).toFixed(0);
});

// CASH判定時のボラティリティリセット
isCashAInput.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.getElementById('volA').value = 0;
    }
});
isCashBInput.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.getElementById('volB').value = 0;
    }
});

// ボックス＝ミューラー法による標準正規乱数の生成
function generateStandardNormal() {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// 相関を持つ2つの標準正規乱数を生成
function generateCorrelatedNormals(rho) {
    const z1 = generateStandardNormal();
    const z2 = generateStandardNormal();
    const zB = rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * z2;
    return [z1, zB];
}

// 単一パスのシミュレーション実行
function runSinglePath(params) {
    const { muA, sigmaA, wA, isCashA, muB, sigmaB, wB, isCashB, rho, taxRate, initialCapital, years } = params;
    
    // 初期評価額
    let valA = initialCapital * (wA / 100);
    let valB = initialCapital * (wB / 100);
    
    // 取得簿価（初期コスト）
    let costA = valA;
    let costB = valB;

    const path = [initialCapital];

    // 配分100%時のスキップ判定 (どちらかが100%ならリバランス・課税を一切行わない)
    const skipRebalance = (wA >= 100 || wB >= 100 || wA <= 0 || wB <= 0);

    for (let y = 1; y <= years; y++) {
        // 1. 幾何ブラウン運動による1年間の資産変動
        const [zA, zB] = generateCorrelatedNormals(rho);
        
        const driftA = muA - 0.5 * sigmaA * sigmaA;
        const driftB = muB - 0.5 * sigmaB * sigmaB;

        valA = valA * Math.exp(driftA + sigmaA * zA);
        valB = valB * Math.exp(driftB + sigmaB * zB);

        // 2. 年1回のリバランス＆譲渡所得課税処理
        if (!skipRebalance) {
            const totalVal = valA + valB;
            const targetValA = totalVal * (wA / 100);
            const targetValB = totalVal * (wB / 100);

            if (valA > targetValA) {
                // 【資産Aの売却 -> 資産Bの買い増し】
                const sellValA = valA - targetValA;

                // 資産Aの含み益（実現益）と税金の計算
                let tax = 0;
                if (!isCashA && valA > 0) {
                    const gainRatioA = Math.max(0, (valA - costA) / valA); // 売却額に含まれる含み益割合
                    const realizedGainA = sellValA * gainRatioA;
                    tax = realizedGainA * taxRate;
                }

                // 資産Aの簿価減額（売却割合に応じて減額）
                if (valA > 0) {
                    costA -= (sellValA / valA) * costA;
                }
                valA -= sellValA;

                // 税金を差し引いた手残り資金で資産Bを購入
                const buyValB = sellValA - tax;
                valB += buyValB;
                costB += buyValB; // 資産Bの簿価加算

            } else if (valB > targetValB) {
                // 【資産Bの売却 -> 資産Aの買い増し】
                const sellValB = valB - targetValB;

                // 資産Bの含み益（実現益）と税金の計算
                let tax = 0;
                if (!isCashB && valB > 0) {
                    const gainRatioB = Math.max(0, (valB - costB) / valB); // 売却額に含まれる含み益割合
                    const realizedGainB = sellValB * gainRatioB;
                    tax = realizedGainB * taxRate;
                }

                // 資産Bの簿価減額（売却割合に応じて減額）
                if (valB > 0) {
                    costB -= (sellValB / valB) * costB;
                }
                valB -= sellValB;

                // 税金を差し引いた手残り資金で資産Aを購入
                const buyValA = sellValB - tax;
                valA += buyValA;
                costA += buyValA; // 資産Aの簿価加算
            }
        }

        path.push(valA + valB);
    }

    return path;
}

// メイン計算処理
function simulate() {
    const params = {
        muA: (parseFloat(document.getElementById('returnA').value) || 0) / 100,
        sigmaA: (parseFloat(document.getElementById('volA').value) || 0) / 100,
        wA: parseFloat(document.getElementById('weightA').value) || 0,
        isCashA: document.getElementById('isCashA').checked,
        
        muB: (parseFloat(document.getElementById('returnB').value) || 0) / 100,
        sigmaB: (parseFloat(document.getElementById('volB').value) || 0) / 100,
        wB: parseFloat(document.getElementById('weightB').value) || 0,
        isCashB: document.getElementById('isCashB').checked,

        rho: parseFloat(document.getElementById('correlation').value) || 0,
        taxRate: (parseFloat(document.getElementById('taxRate').value) || 0) / 100,
        initialCapital: parseFloat(document.getElementById('initialCapital').value) || 1000,
        years: parseInt(document.getElementById('years').value) || 20,
        simulations: parseInt(document.getElementById('simulations').value) || 100
    };

    const allPaths = [];
    for (let i = 0; i < params.simulations; i++) {
        allPaths.push(runSinglePath(params));
    }

    // 統計計算 (最終年の試行結果を取得)
    const finalValues = allPaths.map(p => p[p.length - 1]).sort((a, b) => a - b);
    
    const getPercentile = (arr, p) => {
        const idx = Math.floor(arr.length * p);
        return arr[Math.min(idx, arr.length - 1)];
    };

    const p10 = getPercentile(finalValues, 0.10);
    const median = getPercentile(finalValues, 0.50);
    const p90 = getPercentile(finalValues, 0.90);

    // UI更新
    document.getElementById('statP10').innerText = `${p10.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;
    document.getElementById('statMedian').innerText = `${median.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;
    document.getElementById('statP90').innerText = `${p90.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;

    // グラフ更新
    updateChart(allPaths, params.years);
}

// Chart.js グラフ描画
function updateChart(paths, years) {
    const ctx = document.getElementById('simChart').getContext('2d');
    const labels = Array.from({ length: years + 1 }, (_, i) => `${i}年目`);

    // 全パスのデータセット構築
    const datasets = paths.map((path) => ({
        data: path,
        borderColor: 'rgba(99, 102, 241, 0.15)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0.1
    }));

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.toFixed(1)} 万円`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    title: { display: true, text: '資産評価額 (万円)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

// イベントリスナー登録
runBtn.addEventListener('click', simulate);

// 初期化実行
window.addEventListener('DOMContentLoaded', simulate);