(function () {
  'use strict';
  window.CampusSeed = function () {
    const base = Date.now();
    const records = [
      ['黑色长柄雨伞', 'lost', '生活用品', '教学楼', '旗山校区 · 东2教学楼302', '伞柄有一圈银色金属环，伞套是深蓝色。如果有同学看到，麻烦帮忙留意一下。', 'student-lin', '林同学', 2, 'open'],
      ['校园卡（蓝色卡套）', 'found', '校园卡 / 证件', '食堂', '旗山校区 · 第三食堂一楼', '在靠窗的餐桌上捡到，带蓝色卡套。请联系并描述卡片上的信息，确认后归还。', 'student-zhou', '周同学', 4, 'open'],
      ['白色保温杯', 'found', '生活用品', '图书馆', '旗山校区 · 图书馆三楼自习区', '杯身贴着一张小猫贴纸，已交到三楼服务台，可以先联系确认。', 'me', '我', 8, 'open'],
      ['AirPods 耳机盒', 'lost', '电子设备', '运动场', '旗山校区 · 东区田径场看台', '白色耳机盒，外面套着绿色保护壳。已经找到，谢谢帮忙的同学。', 'student-chen', '陈同学', 22, 'completed'],
      ['高等数学课本', 'lost', '书籍文具', '宿舍区', '旗山校区 · 生活区6号楼附近', '书内有很多铅笔批注，封底写了名字。可能落在楼下的长椅上。', 'me', '我', 26, 'open'],
      ['一串钥匙', 'found', '生活用品', '教学楼', '旗山校区 · 西3教学楼一楼', '两把银色钥匙，挂着黄色小鸭钥匙扣。已和失主确认并归还。', 'me', '我', 46, 'completed']
    ];
    return { version: 1, favorites: [], items: records.map((r, index) => {
      const time = new Date(base - r[8] * 3600000);
      const localTime = new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      return { id: `demo-${index + 1}`, name: r[0], type: r[1], category: r[2], locationGroup: r[3], locationDetail: r[4], description: r[5], ownerId: r[6], ownerName: r[7], occurredAt: localTime, contact: '微信：campus_demo', status: r[9], image: 'assets/default-item.svg', createdAt: time.toISOString(), updatedAt: time.toISOString(), isDemo: true };
    }) };
  };
})();
