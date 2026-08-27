<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const active = ref(0);
</script>

<template>
  <div class="app-container">
    <router-view></router-view>
    <van-tabbar
      v-if="['Home','Workshop','Profile'].includes(route.name as string)"
      route
      v-model="active"
    >
      <van-tabbar-item to="/" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/workshop" icon="orders-o">分析</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="contact-o">关于</van-tabbar-item>
    </van-tabbar>
  </div>
</template>
