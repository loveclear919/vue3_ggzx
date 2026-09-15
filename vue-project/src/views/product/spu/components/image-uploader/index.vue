<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { UploadRequestHandler, UploadProps } from 'element-plus'
import { uploadFile } from '@/api/upload'
import type { SpuImage } from '@/api/product/spu/type'
import { SPU_LIMITS } from '../constants'

// 图片墙编辑器：选图即上传（两段式），URL 收集进 v-model；数量上限见 SPU_LIMITS
const model = defineModel<SpuImage[]>({ required: true })

const uploading = ref(false)

// 上传前客户端校验（与后端 multer 白名单一致，双重防线）
const beforeImageUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (!rawFile.type.startsWith('image/')) {
    ElMessage.error('仅支持图片文件')
    return false
  }
  if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage.error('图片大小不能超过 2MB')
    return false
  }
  if (model.value.length >= SPU_LIMITS.MAX_IMAGE_COUNT) {
    ElMessage.error(`最多上传 ${SPU_LIMITS.MAX_IMAGE_COUNT} 张图片`)
    return false
  }
  return true
}

// 自定义上传：先落盘拿 URL，URL 字符串随表单提交入库
const handleImageUpload: UploadRequestHandler = async (options) => {
  uploading.value = true
  try {
    const formData = new FormData()
    // 相当于注册一个名为 file 的字段，后端 multer 会根据这个字段名来解析文件
    formData.append('file', options.file)
    const res = await uploadFile(formData)
    model.value = [...model.value, { imageUrl: res.url, imageName: options.file.name }]
    options.onSuccess(res)
  } catch (error) {
    // 运行时仅记录错误对象，never 断言只为满足类型
    options.onError(error as never)
  } finally {
    uploading.value = false
  }
}

const removeImage = (index: number) => {
  model.value = model.value.filter((_, i) => i !== index)
}
</script>
<template>
  <div class="image-editor">
    <div v-for="(image, index) in model" :key="image.imageUrl" class="image-item">
      <el-image :src="image.imageUrl" fit="cover" class="image-thumb" />
      <el-icon class="image-remove" @click="removeImage(index)">
        <Delete />
      </el-icon>
    </div>
    <el-upload
      :show-file-list="false"
      :http-request="handleImageUpload"
      :before-upload="beforeImageUpload"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple
    >
      <div class="upload-trigger" v-loading="uploading">
        <el-icon>
          <Plus />
        </el-icon>
        <span>上传图片</span>
      </div>
    </el-upload>
  </div>
</template>

<style scoped lang="scss">
.image-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-item {
  position: relative;
  width: 100px;
  height: 100px;

  .image-thumb {
    width: 100%;
    height: 100%;
    border-radius: 6px;
  }

  .image-remove {
    position: absolute;
    top: -8px;
    right: -8px;
    // 固定尺寸的 flex 居中容器：圆圈(22px) > 图标(13px)，四周留出缝隙，不再紧贴边缘
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    font-size: 13px;
    color: #fff;
    background-color: #f56c6c;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.1);
    }
  }
}

.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100px;
  height: 100px;
  font-size: 12px;
  color: #8c939d;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
  }
}
</style>
