<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getAttrList } from '@/api/product/attr'
import { createSpu, updateSpu } from '@/api/product/spu'
import type { SpuInfo, SpuImage, SpuSaleAttr } from '@/api/product/spu/type'
import type { BrandInfo } from '@/api/product/trademark/type'
import type { BaseSaleAttrInfo } from '@/api/product/baseSaleAttr/type'
import ImageUploader from '@/components/image-uploader/index.vue'
import PlatformAttrEditor from '../platform-attr-editor/index.vue'
import SaleAttrEditor from '../sale-attr-editor/index.vue'
import type { SpuAttrForm } from '../../types.ts'
import { SPU_LIMITS } from '../../constants.ts'

// SPU 新增/编辑弹窗：持有表单数据与提交逻辑，子编辑器（图片/平台属性/销售属性）只做展示与 v-model 回传
const props = defineProps<{
  editingRow: SpuInfo | null // null = 新增；有值 = 编辑
  categoryId: string // 所属三级分类（新增时初始化平台属性行、提交 payload 用）
  brandOptions: BrandInfo[]
  saleAttrOptions: BaseSaleAttrInfo[]
}>()
const emit = defineEmits<{ success: [] }>()

// v-model 双向绑定：defineModel 自动声明 modelValue prop 与 update:modelValue
const dialogVisible = defineModel<boolean>({ required: true })
const dialogTitle = computed(() => (props.editingRow ? '编辑SPU' : '新增SPU'))

interface SpuForm {
  name: string
  description: string
  brandId: string
  imageList: SpuImage[]
  attrList: SpuAttrForm[]
  saleAttrList: SpuSaleAttr[]
}

const formRef = ref<FormInstance>()
const form = reactive<SpuForm>({
  name: '',
  description: '',
  brandId: '',
  imageList: [],
  attrList: [],
  saleAttrList: [],
})

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入 SPU 名称', trigger: 'blur' },
    {
      max: SPU_LIMITS.NAME_LENGTH,
      message: `SPU 名称不能超过 ${SPU_LIMITS.NAME_LENGTH} 个字符`,
      trigger: 'blur',
    },
  ],
  brandId: [{ required: true, message: '请选择品牌', trigger: 'change' }],
}

const resetForm = () => {
  form.name = ''
  form.description = ''
  form.brandId = ''
  form.imageList = []
  form.attrList = []
  form.saleAttrList = []
  formRef.value?.clearValidate()
}

// ---- 打开时初始化：新增拉平台属性行；编辑填快照 + 回拉候选 ----
const platformAttrLoading = ref(false)

const loadPlatformAttrs = async (categoryId: string) => {
  platformAttrLoading.value = true
  try {
    const attrs = await getAttrList(categoryId)
    form.attrList = attrs.map((attr) => ({
      attrName: attr.name,
      attrValue: '',
      valueOptions: attr.values,
    }))
  } catch {
    // 拉取失败（如分类无属性）时保持空列表，错误提示由拦截器弹出
  } finally {
    platformAttrLoading.value = false
  }
}

const fillEditForm = async (row: SpuInfo) => {
  form.name = row.name
  form.description = row.description
  form.brandId = row.brandId
  // 深拷贝：编辑期间对表单的增删不得污染列表原数据
  form.imageList = row.imageList.map((image) => ({ ...image }))
  form.attrList = row.attrList.map((attr) => ({ ...attr, valueOptions: [] }))
  form.saleAttrList = row.saleAttrList.map((saleAttr) => ({
    saleAttrName: saleAttr.saleAttrName,
    saleAttrValueList: [...saleAttr.saleAttrValueList],
  }))
  formRef.value?.clearValidate()

  // 回拉该分类平台属性：快照 ∪ 当前分类合并
  platformAttrLoading.value = true
  try {
    const attrs = await getAttrList(row.category3Id)
    const valueOptionsMap: Record<string, string[]> = {}
    const currentNames = new Set<string>()
    for (const attr of attrs) {
      valueOptionsMap[attr.name] = attr.values
      currentNames.add(attr.name)
    }
    // 保留属性中已有的名称或非空的历史记录
    form.attrList = form.attrList.filter(
      (formAttr) => currentNames.has(formAttr.attrName) || formAttr.attrValue.trim() !== '',
    )
    // 填充候选值
    for (const formAttr of form.attrList) {
      formAttr.valueOptions = valueOptionsMap[formAttr.attrName] ?? []
    }
    // 追加分类新增的属性
    for (const attr of attrs) {
      if (!form.attrList.some((formAttr) => formAttr.attrName === attr.name)) {
        form.attrList.push({ attrName: attr.name, attrValue: '', valueOptions: attr.values })
      }
    }
  } catch {
    // 拉取失败不影响编辑：候选为空，属性值仍是自由输入
  } finally {
    platformAttrLoading.value = false
  }
}

watch(dialogVisible, (opened) => {
  if (!opened) return
  if (props.editingRow) {
    fillEditForm(props.editingRow)
  } else {
    resetForm()
    loadPlatformAttrs(props.categoryId)
  }
})

// ---- 提交 ----
// beforeSubmit 清洗后把产物透传给 onSuccess（形参接收，无缓存 ref —— 时序契约由类型系统检查）
const { submitting, submit } = useFormSubmit({
  formRef,
  beforeSubmit: () => {
    // 销售属性名称去重
    // 去掉前后空格 并去掉假值
    const saleAttrNames = form.saleAttrList
      .map((saleAttr) => saleAttr.saleAttrName.trim())
      .filter(Boolean)
    if (new Set(saleAttrNames).size !== saleAttrNames.length) {
      ElMessage.warning('销售属性名不能重复')
      return false
    }

    // 销售属性值清洗：trim + 去重 + 至少一个值 + 值长度 / 值个数拦截（边界见 SPU_LIMITS）
    const cleanedSaleAttrList = form.saleAttrList.map((saleAttr) => ({
      saleAttrName: saleAttr.saleAttrName.trim(),
      saleAttrValueList: [
        ...new Set(saleAttr.saleAttrValueList.map((value) => value.trim()).filter(Boolean)),
      ],
    }))
    for (const saleAttr of cleanedSaleAttrList) {
      if (!saleAttr.saleAttrName || saleAttr.saleAttrValueList.length === 0) {
        ElMessage.warning('销售属性需填写名称和至少一个值')
        return false
      }
      if (saleAttr.saleAttrValueList.length > SPU_LIMITS.MAX_SALE_ATTR_VALUES) {
        ElMessage.warning(
          `销售属性「${saleAttr.saleAttrName}」最多 ${SPU_LIMITS.MAX_SALE_ATTR_VALUES} 个值`,
        )
        return false
      }
      const tooLong = saleAttr.saleAttrValueList.find(
        (value) => value.length > SPU_LIMITS.SALE_ATTR_VALUE_LENGTH,
      )
      if (tooLong) {
        ElMessage.warning(`销售属性值「${tooLong}」超过 ${SPU_LIMITS.SALE_ATTR_VALUE_LENGTH} 字符`)
        return false
      }
    }

    // 平台属性值清洗：trim + 值长度拦截（valueOptions 仅前端候选，不随 payload 提交）
    const cleanedAttrList = form.attrList.map((attr) => ({
      attrName: attr.attrName,
      attrValue: attr.attrValue.trim(),
    }))
    const tooLongAttr = cleanedAttrList.find(
      (attr) => attr.attrValue.length > SPU_LIMITS.ATTR_VALUE_LENGTH,
    )
    if (tooLongAttr) {
      ElMessage.warning(
        `平台属性「${tooLongAttr.attrName}」的值超过 ${SPU_LIMITS.ATTR_VALUE_LENGTH} 字符`,
      )
      return false
    }

    return { cleanedSaleAttrList, cleanedAttrList }
  },
  onSuccess: async ({ cleanedSaleAttrList, cleanedAttrList }) => {
    const payload = {
      name: form.name,
      description: form.description,
      brandId: form.brandId,
      category3Id: props.categoryId,
      imageList: form.imageList,
      attrList: cleanedAttrList,
      saleAttrList: cleanedSaleAttrList,
    }

    if (props.editingRow) {
      await updateSpu(props.editingRow.spuId, payload)
      ElMessage.success('修改成功')
    } else {
      await createSpu(payload)
      ElMessage.success('新增成功')
    }
    emit('success')
  },
})

const handleSubmit = () => {
  void submit()
}
</script>
<template>
  <!-- append-to-body：脱离内容区 z-index:0 的层叠上下文，弹窗才能压过顶部导航（z-index:100） -->
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="800px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <el-divider content-position="left">基本信息</el-divider>
      <el-form-item label="SPU名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="请输入 SPU 名称"
          :maxlength="SPU_LIMITS.NAME_LENGTH"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="SPU描述" prop="description">
        <el-input
          v-model="form.description"
          placeholder="请输入 SPU 描述"
          :maxlength="SPU_LIMITS.DESCRIPTION_LENGTH"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="品牌" prop="brandId">
        <el-select
          v-model="form.brandId"
          placeholder="请选择品牌"
          filterable
          clearable
          class="full-width"
        >
          <el-option
            v-for="brand in brandOptions"
            :key="brand.brandId"
            :label="brand.name"
            :value="brand.brandId"
          />
        </el-select>
      </el-form-item>

      <el-divider content-position="left">SPU图片</el-divider>
      <el-form-item label="图片">
        <ImageUploader v-model="form.imageList" :max="SPU_LIMITS.MAX_IMAGE_COUNT" />
      </el-form-item>

      <!-- divider 已是分区标题，不再用 form-item label（避免 label 列 + 行内名称双重缩进） -->
      <el-divider content-position="left">平台属性</el-divider>
      <PlatformAttrEditor v-model="form.attrList" :loading="platformAttrLoading" />

      <el-divider content-position="left">销售属性</el-divider>
      <el-form-item label="销售属性">
        <SaleAttrEditor v-model="form.saleAttrList" :options="saleAttrOptions" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
// 表单内占满行宽的控件（el-select 默认宽度随内容伸缩，需显式撑满）
.full-width {
  width: 100%;
}
</style>
