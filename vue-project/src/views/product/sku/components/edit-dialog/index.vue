<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
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

const { submitting, submit } = useFormSubmit({
  formRef,
  beforeSubmit: async () => {
    // 闭包内 TS 收窄不延续，null 守卫补进回调（调用方 handleSubmit 的守卫无法覆盖到这里）
    if (!props.sku) return false
    const cents = yuanToCents(form.value.priceYuan)
    if (cents === null) {
      ElMessage.warning('价格格式不合法（最多两位小数）')
      return false
    }
    if (cents > SKU_LIMITS.PRICE_MAX) {
      ElMessage.warning(`价格不能超过 ${centsToYuan(SKU_LIMITS.PRICE_MAX)} 元`)
      return false
    }
    // 上架闸门（与后端同规则，判生效后状态）：上架/在架必须有价。
    // 文案按原状态分流：本来就在架 = 改价到 0；本来下架 = 未定价上架
    if (form.value.isSale && cents <= 0) {
      if (props.sku.isSale) {
        ElMessage.warning('在架 SKU 不能改为未定价，请先下架')
      } else {
        ElMessage.warning('请先设置价格再上架')
      }
      return false
    }
    // 零库存上架软提醒（与列表页开关同一条规则）：只拦「本次保存新造出售罄状态」——
    // 给一条本来就是售罄的 SKU 改名字、改描述不该被问「确认上架？」，所以先算原状态
    const wasSoldOut = props.sku.isSale && props.sku.stock <= 0
    if (form.value.isSale && form.value.stock <= 0 && !wasSoldOut) {
      try {
        await ElMessageBox.confirm(
          '该 SKU 保存后为「在架 + 零库存」，将显示为售罄。确认保存吗？',
          '零库存上架',
          { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' },
        )
      } catch {
        return false // 用户取消：中断提交，表单内容原样保留
      }
    }
    // 检查产物透传：换算好的分由 onSuccess 形参接收，无缓存 ref
    return cents
  },
  onSuccess: async (cents) => {
    if (!props.sku) return
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
  },
})

const handleSubmit = () => {
  if (!props.sku) return
  void submit()
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
