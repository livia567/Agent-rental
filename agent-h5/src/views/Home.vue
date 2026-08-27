<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { useWorkshopStore } from "../stores/workshop";
import { sampleContractWithTraps, sampleStandardContract } from "../data/sampleContracts";

const router = useRouter();
const store = useWorkshopStore();

const contractText = ref("");
const imageBase64 = ref<string[]>([]);
const isloading = ref(false);
const showImagePreview = ref(false);

onMounted(() => {
  // 只有没在分析时才重置（避免切 Tab 时清掉后台正在跑的分析）
  if (store.analysisPhase === 'idle') {
    store.reset()
  }
});

// 处理图片上传
const handleImageUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;

  imageBase64.value = [];
  const readers = Array.from(files).map(file =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
      reader.readAsDataURL(file);
    })
  );
  Promise.all(readers).then(bases => {
    imageBase64.value = bases;
    showImagePreview.value = true;
  });
};

// 提交分析
const handleSubmit = () => {
  const hasText = contractText.value.trim().length > 0;
  const hasImage = imageBase64.value.length > 0;
  if (!hasText && !hasImage) {
    showToast("请输入合同文本或上传合同照片");
    return;
  }
  if (!hasImage && contractText.value.trim().length < 50) {
    showToast("字数小于50字，请输入正确格式的合同");
    return;
  }
  isloading.value = true;
  store.contractText = contractText.value.trim();
  store.imageBase64 = imageBase64.value;
  router.push({ path: "/workshop" });
};

// 一键体验：仅填入示例合同文本，不自动分析、不跳转
const handleQuickDemo = () => {
  contractText.value = sampleContractWithTraps;
  showToast("已填入示例合同");
};

// 填入示例
const fillSample = (sample: string) => {
  contractText.value = sample;
  showToast("已填入示例合同");
  // 滚动到文本区域让用户看到已填入的内容
  const textarea = document.querySelector(".contract-textarea");
  if (textarea) {
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <van-nav-bar title="租房避坑" />
    </div>

    <div class="page-content">
      <!-- 标题区 -->
      <div class="hero-section">
        <h1 class="hero-title"><van-icon name="shop-collect-o" /><span>租房避坑</span></h1>
        <p class="hero-subtitle">你的合同智能审查助手</p>
      </div>

      <!-- 文本输入区 -->
      <div class="card input-card">
        <div class="section-title">粘贴合同文本</div>
        <textarea
          v-model="contractText"
          class="contract-textarea"
          placeholder="在此粘贴你的租房合同文本...&#10;&#10;示例：&#10;房屋租赁合同&#10;甲方（出租方）：张三&#10;乙方（承租方）：李四&#10;第一条 租金条款..."
          rows="10"
        ></textarea>
      </div>

      <!-- 拍照上传区 -->
      <div class="card upload-card">
        <div class="section-title">拍照上传合同照片</div>
        <label class="upload-area">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            class="upload-input"
            @change="handleImageUpload"
          />
          <div v-if="!showImagePreview" class="upload-placeholder">
            <span class="upload-icon"><van-icon name="photo-o" /></span>
            <span class="upload-text">点击拍照或从相册选择</span>
          </div>
          <div v-else class="upload-preview">
            <span class="upload-icon"><van-icon name="passed" /></span>
            <span class="upload-text">已选择 {{ imageBase64.length }} 张图片</span>
          </div>
        </label>
      </div>

      <!-- 提交按钮 -->
      <div class="action-section">
        <button
          class="btn-primary"
          :disabled="isloading"
          @click="handleSubmit"
        >
          {{ isloading ? "分析中..." : "开始分析" }}
        </button>

        <p class="demo-hint">
          没有合同？
          <a class="demo-link" @click="handleQuickDemo"> 一键体验完整功能</a>
        </p>
      </div>

      <!-- 使用示例 -->
      <div class="examples-section">
        <div class="section-divider">使用示例</div>
        <div class="card example-card" @click="fillSample(sampleContractWithTraps)">
          <div class="example-title"><van-icon name="warning-o" /><span> 含霸王条款的合同示例</span></div>
          <div class="example-desc">包含押金模糊条款、维修责任推诿等常见陷阱</div>
        </div>
        <div class="card example-card" @click="fillSample(sampleStandardContract)">
          <div class="example-title"><van-icon name="passed" /> <span>标准租房合同示例</span></div>
          <div class="example-desc">条款规范、权责清晰的标准化合同</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-section {
  text-align: center;
  padding: 32px 0 24px;
}
.hero-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text-primary);
}
.hero-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 8px 0 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.contract-textarea {
  width: 100%;
  min-height: 200px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  box-sizing: border-box;
}
.contract-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  background: var(--color-bg);
}

.upload-area {
  display: block;
  cursor: pointer;
}
.upload-input {
  display: none;
}
.upload-placeholder,
.upload-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color 0.2s;
}
.upload-placeholder:hover {
  border-color: var(--color-accent);
}
.upload-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.upload-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.action-section {
  text-align: center;
  margin: 24px 0;
}
.demo-hint {
  margin-top: 16px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.demo-link {
  color: var(--color-accent);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.demo-link:hover {
  text-decoration: underline;
}

.examples-section {
  margin-top: 32px;
}
.section-divider {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}
.example-card {
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}
.example-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.example-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.example-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
