<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import CategoryDrilldown from '@/components/category/index.vue'
import type { CategoryFlatNode } from '@/api/category/type'
import { getAttrList, createAttr, updateAttr, deleteAttr } from '@/api/product/attr'
import type { AttrInfo } from '@/api/product/attr/type'
import { ATTR_LIMITS } from './constants'

// ---- 逐级下钻分类选择（左侧）：下钻逻辑抽离为全局组件 components/category，本页只响应选中 ----
// 当前选中的三级分类（null = 未选择）
const selectedCategory = ref<CategoryFlatNode | null>(null)

// 选中三级分类：查该分类下的属性列表
const handleCategorySelect = (node: CategoryFlatNode) => {
  selectedCategory.value = node
  fetchAttrList()
}

// ---- 属性列表（右侧） ----
const attrList = ref<AttrInfo[]>([])
const loading = ref(false)
// 空态文案区分两种语义：未选择分类 = 引导；已选择但无数据 = 结果说明
const emptyText = computed(() => (selectedCategory.value ? '暂无数据' : '请先在左侧选择三级分类'))

// 展示当前选中分类的属性列表
const fetchAttrList = async () => {
  if (!selectedCategory.value) return
  loading.value = true
  try {
    attrList.value = await getAttrList(selectedCategory.value.categoryId)
  } catch {
    // 错误提示已由响应拦截器统一弹出
  } finally {
    loading.value = false
  }
}

// ---- 新增 / 编辑（共用弹窗） ----
const dialogVisible = ref(false)
const submitting = ref(false)
const editingId = ref<string | null>(null)
const dialogTitle = computed(() => (editingId.value ? '编辑属性' : '新增属性'))

const formRef = ref<FormInstance>()
const form = reactive({ name: '', values: [] as string[] })
// 属性值输入框的临时输入
const newValue = ref('')

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入属性名称', trigger: 'blur' },
    {
      max: ATTR_LIMITS.NAME_LENGTH,
      message: `属性名称不能超过 ${ATTR_LIMITS.NAME_LENGTH} 个字符`,
      trigger: 'blur',
    },
  ],
  values: [
    { type: 'array', required: true, min: 1, message: '至少添加一个属性值', trigger: 'change' },
  ],
}

const handleAdd = () => {
  editingId.value = null
  form.name = ''
  form.values = []
  newValue.value = ''
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

const handleEdit = (row: AttrInfo) => {
  editingId.value = row.attrId
  form.name = row.name
  form.values = [...row.values]
  newValue.value = ''
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

const addValue = () => {
  if (form.values.length >= ATTR_LIMITS.MAX_VALUES_COUNT) {
    ElMessage.warning(`属性值最多 ${ATTR_LIMITS.MAX_VALUES_COUNT} 个`)
    return
  }
  const value = newValue.value.trim()
  if (!value) return
  if (form.values.includes(value)) {
    ElMessage.warning('属性值已存在')
    return
  }
  form.values.push(value)
  newValue.value = ''
}

const removeValue = (index: number) => {
  form.values.splice(index, 1)
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (editingId.value) {
      await updateAttr(editingId.value, { name: form.name, values: form.values })
      ElMessage.success('修改成功')
    } else {
      await createAttr({
        categoryId: selectedCategory.value!.categoryId,
        name: form.name,
        values: form.values,
      })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchAttrList()
  } catch {
    // 失败提示由拦截器弹出（如 409 该分类下已存在同名属性）
  } finally {
    submitting.value = false
  }
}

// ---- 删除 ----
const handleDelete = async (row: AttrInfo) => {
  try {
    await ElMessageBox.confirm(`确定删除属性「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }

  try {
    await deleteAttr(row.attrId)
    ElMessage.success('删除成功')
    fetchAttrList()
  } catch {
    // 失败提示由拦截器弹出
  }
}
</script>
<template>
  <!-- 单根容器：路由切换的 Transition 只能动画单根元素组件（多根 fragment 会警告且动画失效） -->
  <div class="attr-page">
    <el-row :gutter="20">
      <!-- 左侧：逐级下钻分类选择（抽离为全局组件 components/category，本页只响应 select 事件） -->
      <el-col :span="6">
        <CategoryDrilldown
          :selected-id="selectedCategory?.categoryId"
          @select="handleCategorySelect"
        />
      </el-col>

      <!-- 右侧：属性列表 -->
      <el-col :span="18">
        <el-card shadow="never">
          <template #header>
            <div class="attr-header">
              <span class="card-title">
                属性列表{{ selectedCategory ? `（${selectedCategory.name}）` : '' }}
              </span>
              <el-button
                type="primary"
                size="default"
                :icon="Plus"
                :disabled="!selectedCategory"
                @click="handleAdd"
                >添加属性</el-button
              >
            </div>
          </template>
          <el-table :data="attrList" border stripe v-loading="loading" :empty-text="emptyText">
            <el-table-column label="序号" width="80" align="center">
              <template #default="scope">
                <span>{{ scope.$index + 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="属性名称" width="180" show-overflow-tooltip>
              <template #default="scope">
                <span>{{ scope.row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="属性值">
              <template #default="scope">
                <el-tag v-for="value in scope.row.values" :key="value" class="attr-value-tag">
                  {{ value }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="default"
                  :icon="Edit"
                  @click="handleEdit(scope.row as AttrInfo)"
                ></el-button>
                <el-button
                  type="danger"
                  size="default"
                  :icon="Delete"
                  @click="handleDelete(scope.row as AttrInfo)"
                ></el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增 / 编辑弹窗 -->
    <!-- append-to-body：脱离内容区 z-index:0 的层叠上下文，弹窗才能压过顶部导航（z-index:100） -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="560px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="属性名称" prop="name">
          <el-input
            v-model="form.name"
            placeholder="如：颜色"
            :maxlength="ATTR_LIMITS.NAME_LENGTH"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="属性值" prop="values">
          <div class="values-editor">
            <div class="values-tags">
              <el-tag
                v-for="(value, index) in form.values"
                :key="value"
                closable
                class="values-tag"
                @close="removeValue(index)"
              >
                {{ value }}
              </el-tag>
            </div>
            <div class="values-input-row">
              <el-input
                v-model="newValue"
                placeholder="输入属性值，回车或点添加"
                class="value-input"
                :maxlength="ATTR_LIMITS.VALUE_LENGTH"
                show-word-limit
                @keyup.enter="addValue"
              />
              <el-button :icon="Plus" @click="addValue">添加</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.card-title {
  font-size: 15px;
  font-weight: 600;
}

.attr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.values-editor {
  /* 上下两段结构：标签区 + 输入区彻底分开，互不参与同一行的换行 */
  display: block;
}

.values-tags {
  display: flex;
  flex-wrap: wrap;
}

.values-tag {
  margin: 0 8px 8px 0;
}

.values-input-row {
  display: flex;
  gap: 8px;
}

.value-input {
  /* 占满整行、随容器宽度自适应，不写死像素宽度 */
  flex: 1;
}

.attr-value-tag {
  margin: 2px 6px 2px 0;
}
</style>
