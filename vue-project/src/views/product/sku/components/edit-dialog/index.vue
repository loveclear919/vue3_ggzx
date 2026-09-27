<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { updateSku } from '@/api/product/sku'
import type { SkuInfo } from '@/api/product/sku/type'
import type { SpuImage } from '@/api/product/spu/type'
import ImageUploader from '@/components/image-uploader/index.vue'
import { centsToYuan, yuanToCents } from '@/utils/money'
import { SKU_LIMITS } from '../../constants'

// 单 SKU 编辑弹窗
const props = defineProps<{ sku: SkuInfo | null; spuFirstImage: string }>()
const emit = defineEmits<{ success: [] }>()
const dialogVisible = defineModel<boolean>({ required: true })

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = ref({
  skuName: '',
  priceYuan: '',
  weight: 0,
  stock: 0,
  skuDesc: '',
  imageList: [] as SpuImage[],
  isSale: false,
})

const formRules: FormRules = {
  skuName: [
    { required: true, message: '请输入 SKU 名称', trigger: 'blur' },
    {
      max: SKU_LIMITS.NAME_LENGTH,
      message: `SKU 名称不能超过 ${SKU_LIMITS.NAME_LENGTH} 个字符`,
      trigger: 'blur',
    },
  ],
}

watch(dialogVisible, (opened) => {
  if (!opened || !props.sku) return
  form.value = {
    skuName: props.sku.skuName,
    priceYuan: centsToYuan(props.sku.price),
    weight: props.sku.weight,
    stock: props.sku.stock,
    skuDesc: props.sku.skuDesc,
    imageList: props.sku.skuDefaultImg
      ? [{ imageUrl: props.sku.skuDefaultImg, imageName: '' }]
      : [],
    isSale: props.sku.isSale,
  }
})

const handleSubmit = async () => {
  if (!props.sku) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const cents = yuanToCents(form.value.priceYuan)
  if (cents === null) {
    ElMessage.warning('价格格式不合法（最多两位小数）')
    return
  }
  if (cents > SKU_LIMITS.PRICE_MAX) {
    ElMessage.warning(`价格不能超过 ${centsToYuan(SKU_LIMITS.PRICE_MAX)} 元`)
    return
  }
  // 上架闸门（与后端同规则）：上架必须有价
  if (form.value.isSale && cents <= 0) {
    ElMessage.warning('请先设置价格再上架')
    return
  }

  submitting.value = true
  try {
    await updateSku(props.sku.skuId, {
      skuName: form.value.skuName,
      price: cents,
      weight: form.value.weight,
      stock: form.value.stock,
      skuDesc: form.value.skuDesc,
      skuDefaultImg: form.value.imageList[0]?.imageUrl ?? '',
      isSale: form.value.isSale,
    })
    ElMessage.success('更新成功')
    emit('success')
  } catch {
    // 失败提示由拦截器弹出
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="dialogVisible" title="编辑SKU" width="560px" append-to-body destroy-on-close>
    <el-form v-if="sku" ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <el-form-item label="规格组合">
        <div class="combo-preview">
          <el-tag v-for="value in sku.skuSaleAttrValueList" :key="value.saleAttrName" size="small">
            {{ value.saleAttrName }}: {{ value.saleAttrValue }}
          </el-tag>
          <span v-if="sku.skuSaleAttrValueList.length === 0" class="no-dim">（无规格）</span>
          <span class="combo-note">组合创建后不可变</span>
        </div>
      </el-form-item>
      <el-form-item label="SKU名称" prop="skuName">
        <el-input v-model="form.skuName" :maxlength="SKU_LIMITS.NAME_LENGTH" show-word-limit />
      </el-form-item>
      <el-form-item label="价格(元)">
        <el-input v-model="form.priceYuan" placeholder="如 5999.00" />
      </el-form-item>
      <el-form-item label="重量(克)">
        <el-input-number
          v-model="form.weight"
          :min="0"
          :max="SKU_LIMITS.WEIGHT_MAX"
          :step="10"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="库存">
        <el-input-number
          v-model="form.stock"
          :min="0"
          :max="SKU_LIMITS.STOCK_MAX"
          :step="1"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          v-model="form.skuDesc"
          type="textarea"
          :rows="2"
          :maxlength="SKU_LIMITS.DESC_LENGTH"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="默认图">
        <ImageUploader v-model="form.imageList" :max="1" />
        <span v-if="form.imageList.length === 0 && spuFirstImage" class="fallback-tip">
          留空则展示 SPU 首图
        </span>
      </el-form-item>
      <el-form-item label="上架">
        <el-switch v-model="form.isSale" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.combo-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.combo-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.no-dim {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.fallback-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
