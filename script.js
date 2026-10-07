// DOM要素の取得
const weightAInput = document.getElementById('weightA');
const weightBInput = document.getElementById('weightB');
const isCashAInput = document.getElementById('isCashA');
const isCashBInput = document.getElementById('isCashB');
const runBtn = document.getElementById('runBtn');

let chartInstance = null;

// 配分比率の自動連動
weightAInput.addEventListener('input', () => {
    let valA = parseFloat(weightAInput.value) || 0;
    if (valA < 0) valA = 0;
    if (valA > 100) valA = 100;
    weightBInput.value = (100 - valA).toFixed(0);
});

// CASH判定時のパラメータ入力自動無効化（オプション）
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
    const zB = rho * z1 + Math.sqrt(1 - rho * rho) * z2;
    return [z1, zB];
}

// 単一パスのシミュレーション実行
function runSinglePath(params) {
    const { muA, sigmaA, wA, isCashA, muB, sigmaB, wB, isCashB, rho, taxRate, initialCapital, years } = params;
    
    // 初期設定
    let valA = initialCapital * (wA / 100);
    let valB = initialCapital * (wB / 100);
    
    // 取得簿価（初期）
    let costA = valA;
    let costB = valB;

    const path = [initialCapital];

    const skipRebalance = (wA === 100 || wB === 100);

    for (let y = 1; y <= years; y++) {
        // 1. 幾何ブラウン運動による1年間の資産変動
        const [zA, zB] = generateCorrelatedNormals(rho);
        
        // 連続複利調整込みの成長率
        const driftA = muA - 0.5 * sigmaA * sigmaA;
        const driftB = muB - 0.5 * sigmaB * sigmaB;

        valA = valA * Math.exp(driftA + sigmaA * zA);
        valB = valB * Math.exp(driftB + sigmaB * zB);

        // 2. 年1回のリバランス＆課税処理 (100%単一配分の場合はスキップ)
        if (!skipRebalance) {
            const totalVal = valA + valB;
            const targetValA = totalVal * (wA / 100);
            const targetValB = totalVal * (wB / 100);

            if (valA > targetValA) {
                // 資産Aの一部を売却 -> 資産Bを買い増し
                const sellValA = valA - targetValA;
                const gainRatioA = valA > 0 ? Math.max(0, (valA - costA) / valA) : 0;
                const realizedGainA = isCashA ? 0 : sellValA * gainRatioA;
                const tax = realizedGainA * taxRate;

                // 簿価減額と売却処理
                costA -= sellValA * (1 - gainRatioA);
                valA -= sellValA;

                // 税金を引いた残額で資産Bを購入
                const buyValB = sellValA - tax;
                valB += buyValB;
                costB += buyValB;

            } else if (valB > targetValB) {
                // 資産Bの一部を売却 -> 資産Aを買い増し
                const sellValB = valB - targetValB;
                const gainRatioB = valB > 0 ? Math.max(0, (valB - costB) / valB) : 0;
                const realizedGainB = isCashB ? 0 : sellValB * gainRatioB;
                const tax = realizedGainB * taxRate;

                // 簿価減額と売却処理
                costB -= sellValB * (1 - gainRatioB);
                valB -= sellValB;

                // 税金を引いた残額で資産Aを購入
                const buyValA = sellValB - tax;
                valA += buyValA;
                costA += buyValA;
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

    // 全パスのデータセット構築 (半透明表示)
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