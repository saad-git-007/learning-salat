// Words and steps of Salat, from "Salat – The Muslim Prayer Book", Chapter Two
// (alislam.org/book/salat/method-of-offering-prayer). Transliterations and
// translations are the book's own; Arabic is split into the phrases the audio follows.

export const RECITE = {
  iqamah: {
    name: 'Iqamah',
    ar: ['اَللّٰهُ أَكْبَرُ اَللّٰهُ أَكْبَرُ', 'أَشْهَدُ أَنْ لَّا إِلٰهَ إِلَّا اللّٰهُ', 'أَشْهَدُ أَنَّ مُحَمَّدًا رَّسُوْلُ اللّٰهِ', 'حَيَّ عَلَى الصَّلٰوةِ', 'حَيَّ عَلَى الْفَلَاحِ', 'قَدْ قَامَتِ الصَّلٰوةُ قَدْ قَامَتِ الصَّلٰوةُ', 'اَللّٰهُ أَكْبَرُ اَللّٰهُ أَكْبَرُ', 'لَا إِلٰهَ إِلَّا اللّٰهُ'],
    tr: ['Allahu Akbar, Allahu Akbar;', 'Ashhadu alla Ilaha illallah;', 'Ashhadu anna Muhammadar Rasulullah;', 'Hayya ‘alas-Salah;', 'Hayya ‘alal-Falah;', 'Qad qamatis-Salatu, Qad qamatis-salah;', 'Allahu Akbar, Allahu Akbar;', 'La Ilaha Illallah'],
    en: 'Allah is the Greatest, Allah is Greatest; I bear witness that there is none worthy of worship except Allah; I bear witness that Muhammad is the Messenger of Allah. Come to Prayer. Come to success. Salat is ready, Salat is ready. Allah is the Greatest; Allah is the Greatest; There is none worthy of worship except Allah.',
    enP: ['Allah is the Greatest, Allah is Greatest;', 'I bear witness that there is none worthy of worship except Allah;', 'I bear witness that Muhammad is the Messenger of Allah.', 'Come to Prayer.', 'Come to success.', 'Salat is ready, Salat is ready.', 'Allah is the Greatest; Allah is the Greatest;', 'There is none worthy of worship except Allah.'],
  },
  takbir: {
    name: 'Takbir',
    ar: ['اَللّٰهُ أَكْبَرُ'], tr: ['Allahu Akbar'], en: 'God is the Greatest.',
  },
  thana: {
    name: 'Thana’',
    ar: ['سُبْحَانَكَ اللّٰهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالٰى جَدُّكَ وَلَا إِلٰهَ غَيْرُكَ'],
    tr: ['Subhanakallah-humma wa bihamdika wa tabarakasmuka wa ta‘ala jadduka wala ilaha ghairuk.'],
    en: 'Holy art Thou, O Allah, and all praise is Thine; blessed is Thy name, and exalted is Thy state. There is none worthy of worship except Thee alone.',
  },
  taawwudh: {
    name: 'Ta‘awwudh',
    ar: ['أَعُوْذُ بِاللّٰهِ مِنَ الشَّيْطٰنِ الرَّجِيْمِ'], tr: ['A‘udhu billahi minash-shaitanir-rajim.'],
    en: 'I seek refuge with Allah from Satan, the accursed.',
  },
  bismillah: {
    name: 'Tasmiyah',
    ar: ['بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ'], tr: ['Bismillahir-Rahmanir-Rahim.'],
    en: 'In the name of Allah, the Gracious, the Merciful.',
  },
  fatihah: {
    name: 'Surah Al-Fatihah',
    ar: ['ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'مَٰلِكِ يَوْمِ ٱلدِّينِ', 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ', 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ', 'غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ'],
    tr: ['Al-hamdu lillahi Rabbil ‘alamin.', 'Ar-rahmanir-Rahim.', 'Maliki yaumiddin.', 'Iyyaka na‘budu wa iyyaka nasta‘in.', 'Ihdinas-sirat al-mustaqim.', 'Siratalladhina an‘amta ‘alai-him,', 'ghairil maghdubi ‘alaihim wa lad-dallin.'],
    en: 'All praise belongs to Allah, Lord of all the worlds, The Gracious, the Merciful, Master of the Day of Judgment. Thee alone do we worship and Thee alone do we implore for help. Guide us in the right path — The path of those on whom Thou hast bestowed Thy blessings, those who have not incurred Thy displeasure, and those who have not gone astray.',
    enP: ['All praise belongs to Allah, Lord of all the worlds,', 'The Gracious, the Merciful,', 'Master of the Day of Judgment.', 'Thee alone do we worship and Thee alone do we implore for help.', 'Guide us in the right path —', 'The path of those on whom Thou hast bestowed Thy blessings,', 'those who have not incurred Thy displeasure, and those who have not gone astray.'],
    after: { ar: 'آمِيْن', tr: 'Amin', en: 'O Allah! Accept our supplications.' },
  },
  ikhlas: {
    name: 'Surah Al-Ikhlas',
    ar: ['بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'قُلْ هُوَ ٱللَّهُ أَحَدٌ', 'ٱللَّهُ ٱلصَّمَدُ', 'لَمْ يَلِدْ وَلَمْ يُولَدْ', 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ'],
    tr: ['Bismillahir-Rahmanir-Rahim.', 'Qul huwallahu Ahad.', 'Allahus-Samad.', 'Lam yalid, walam yulad.', 'Walam yakullahu kufuwan ahad.'],
    en: 'In the name of Allah, the Gracious, the Merciful. Say, He is Allah, the One; Allah, the Independent and Besought of all. He begets not, nor is He begotten; And there is none like unto Him.',
    enP: ['In the name of Allah, the Gracious, the Merciful.', 'Say, He is Allah, the One;', 'Allah, the Independent and Besought of all.', 'He begets not, nor is He begotten;', 'And there is none like unto Him.'],
  },
  ruku: {
    name: 'Tasbih of Ruku‘',
    ar: ['سُبْحَانَ رَبِّيَ الْعَظِيْمِ'], tr: ['Subhana Rabbiyal ‘Azim.'], en: 'Holy is my Lord, the Most Great.',
  },
  tasmi: {
    name: 'Tasmi‘',
    ar: ['سَمِعَ اللّٰهُ لِمَنْ حَمِدَهٗ'], tr: ['Sami‘allahu liman hamidah'], en: 'Allah listens to him who praises Him.',
  },
  tahmid: {
    name: 'Tahmid',
    ar: ['رَبَّنَا وَلَكَ الْحَمْدُ', 'حَمْدًا كَثِيْرًا طَيِّبًا مُّبَارَكًا فِيْهِ'],
    tr: ['Rabbana walakal-hamd,', 'hamdan kathiran Tayyiban Mubarakan fih.'],
    en: 'Our Lord, Thine is the praise, the praise which is bountiful, pure and blessed.',
    enP: ['Our Lord, Thine is the praise,', 'the praise which is bountiful, pure and blessed.'],
  },
  sajdah: {
    name: 'Tasbih of Sajdah',
    ar: ['سُبْحَانَ رَبِّيَ الْأَعْلٰى'], tr: ['Subhana Rabbiyal-a‘la.'], en: 'Glory to my Lord, the Most High.',
  },
  jilsah: {
    name: 'Prayer of Jilsah',
    ar: ['رَبِّ اغْفِرْ لِيْ وَارْحَمْنِيْ وَاهْدِنِيْ وَعَافِنِيْ وَاجْبُرْنِيْ وَارْزُقْنِيْ وَارْفَعْنِيْ'],
    tr: ['Rabbighfir li warhamni wahdini wa ‘afini wajburni warzuqni warfa‘ni.'],
    en: 'Lord forgive me and have mercy on me and guide me and grant me security and make good my shortcomings and provide for me and raise me up.',
  },
  tashahhud: {
    name: 'Tashahhud',
    ar: ['اَلتَّحِيَّاتُ لِلّٰهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ', 'اَلسَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللّٰهِ وَبَرَكَاتُهٗ', 'اَلسَّلَامُ عَلَيْنَا وَعَلٰى عِبَادِ اللّٰهِ الصّٰلِحِيْنَ', 'أَشْهَدُ أَنْ لَّا إِلٰهَ إِلَّا اللّٰهُ', 'وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهٗ وَرَسُوْلُهٗ'],
    tr: ['Attahiyyatu lillahi was-salawatu wat-tayyibatu,', 'Assalamu ‘alaika ayyuhan-Nabiyyu wa Rahmatullahi wa Barakatuh,', 'Assalamu ‘alaina wa ‘ala ibadillahis-Salihin.', 'Ashhadu alla ilaha illallahu', 'wa ashhadu anna Muhammadan ‘abduhu wa Rasuluh.'],
    en: 'All Salutation is due to Allah and all Prayer and everything pure. Peace be upon thee, O Prophet, and the mercy of Allah and His blessings; and peace be on us and on all righteous servants of Allah. I bear witness that there is none worthy of worship except Allah, and I bear witness that Muhammad is His servant and Messenger.',
    enP: ['All Salutation is due to Allah and all Prayer and everything pure.', 'Peace be upon thee, O Prophet, and the mercy of Allah and His blessings;', 'and peace be on us and on all righteous servants of Allah.', 'I bear witness that there is none worthy of worship except Allah,', 'and I bear witness that Muhammad is His servant and Messenger.'],
    pointPhrase: 3,
  },
  durud: {
    name: 'Durud',
    ar: ['اَللّٰهُمَّ صَلِّ عَلٰى مُحَمَّدٍ وَّعَلٰى آلِ مُحَمَّدٍ', 'كَمَا صَلَّيْتَ عَلٰى إِبْرَاهِيْمَ وَعَلٰى آلِ إِبْرَاهِيْمَ', 'إِنَّكَ حَمِيْدٌ مَّجِيْدٌ', 'اَللّٰهُمَّ بَارِكْ عَلٰى مُحَمَّدٍ وَّعَلٰى آلِ مُحَمَّدٍ', 'كَمَا بَارَكْتَ عَلٰى إِبْرَاهِيْمَ وَعَلٰى آلِ إِبْرَاهِيْمَ', 'إِنَّكَ حَمِيْدٌ مَّجِيْدٌ'],
    tr: ['Allahumma salli ‘ala Muhammadin wa ‘ala ali Muhammadin', 'kama sallaita ‘ala Ibrahima wa ‘ala ali Ibrahima', 'innaka Hamidum-Majid.', 'Allahumma Barik ‘ala Muhammadin wa ‘ala ali Muhammadin', 'kama Barakta ‘ala Ibrahima wa ‘ala ali lbrahima', 'innaka Hamidum-Majid.'],
    en: 'Bless, O Allah, Muhammad and the people of Muhammad, as Thou didst bless Abraham and the people of Abraham. Thou art indeed the Praiseworthy, the Glorious. Prosper, O Allah, Muhammad and the people of Muhammad, as Thou didst prosper Abraham and the people of Abraham. Thou are the Praiseworthy, the Glorious.',
    enP: ['Bless, O Allah, Muhammad and the people of Muhammad,', 'as Thou didst bless Abraham and the people of Abraham.', 'Thou art indeed the Praiseworthy, the Glorious.', 'Prosper, O Allah, Muhammad and the people of Muhammad,', 'as Thou didst prosper Abraham and the people of Abraham.', 'Thou are the Praiseworthy, the Glorious.'],
  },
  rabbana: {
    name: 'Rabbana atina',
    ar: ['رَبَّنَآ ءَاتِنَا فِى ٱلدُّنْيَا حَسَنَةًۭ', 'وَفِى ٱلْءَاخِرَةِ حَسَنَةًۭ', 'وَقِنَا عَذَابَ ٱلنَّارِ'],
    tr: ['Rabbana atina fiddunya hasanatan', 'wa fil akhirati hasanatan', 'waqina adhabannar. (2:202)'],
    en: 'Our Lord, grant us good in this world as well as good in the world to come, and protect us from the torment of the Fire.',
    enP: ['Our Lord, grant us good in this world', 'as well as good in the world to come,', 'and protect us from the torment of the Fire.'],
  },
  rabbijalni: {
    name: 'Rabbij‘alni',
    ar: ['رَبِّ ٱجْعَلْنِى مُقِيمَ ٱلصَّلَوٰةِ', 'وَمِن ذُرِّيَّتِى ۚ', 'رَبَّنَا وَتَقَبَّلْ دُعَآءِ', 'رَبَّنَا ٱغْفِرْ لِى وَلِوَٰلِدَىَّ', 'وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ ٱلْحِسَابُ'],
    tr: ['Rabbij‘alni muqimas-Salati', 'wamin dhur-riyyati.', 'Rabbana wa taqabbal du‘a’.', 'Rabbanaghfir li wali- walidayya', 'wa lil-mu’minina yauma yaqumul hisab. (14:41-42)'],
    en: 'My Lord, make me observe Prayer, and my children too. Our Lord! bestow Thy grace on me and accept my prayer. Our Lord, grant forgiveness to me and to my parents and to the believers on the day when the reckoning will take place.',
    enP: ['My Lord, make me observe Prayer,', 'and my children too.', 'Our Lord! bestow Thy grace on me and accept my prayer.', 'Our Lord, grant forgiveness to me and to my parents', 'and to the believers on the day when the reckoning will take place.'],
  },
  salam: {
    name: 'Salam',
    ar: ['اَلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللّٰهِ'], tr: ['Assalamu ‘Alaikum wa Rahmatullah'], en: 'Peace be upon you and the mercy of Allah.',
  },
};

const ORD = ['1st', '2nd', '3rd', '4th'];

// Build the full list of steps for a prayer of 2, 3 or 4 rak'at.
export function buildSteps(rakat) {
  const steps = [];
  const add = (s) => steps.push({ id: `s${steps.length}`, ...s });

  const G = 'Get ready';
  add({ group: G, title: 'Wudu’', sub: 'Get clean', pose: 'stand', view: 'front', icon: 'drop',
    do: 'Make Wudu’ and wear clean clothes. Pray in a clean place.' });
  add({ group: G, title: 'Face the Ka‘bah', sub: 'Stand on your mat', pose: 'stand', view: 'back', icon: 'kaaba',
    do: 'Stand on your prayer mat facing the Ka‘bah, the Qiblah. Wear your topi.' });
  add({ group: G, title: 'Iqamah', sub: 'Salat is about to start', pose: 'iqamah', view: 'front', icon: 'ear',
    do: 'Stand straight with your arms hanging by your sides and listen to the Iqamah. It means the Prayer is about to start.', recite: [{ id: 'iqamah' }] });

  for (let r = 1; r <= rakat; r++) {
    const g = `Rak‘ah ${r}`;
    const first = r === 1;
    const surah = r <= 2;
    if (first) {
      add({ group: g, title: 'Takbir-i-Tahrimah', sub: 'Allahu Akbar', pose: 'takbir', then: 'qiyam', view: 'face', icon: 'hands',
        do: 'Raise both hands beside your ears, palms facing the Qiblah, thumbs level with your earlobes, and say Allahu Akbar. Then fold your hands just above your belly button, right hand over left.', recite: [{ id: 'takbir' }] });
      add({ group: g, title: 'Qiyam · Thana’', sub: 'Praise Allah', pose: 'qiyam', view: 'front', icon: 'stand',
        do: 'Fold your hands just above your belly button, right hand over left. Look at the place where your head will touch in Sajdah.', recite: [{ id: 'thana' }] });
      add({ group: g, title: 'Ta‘awwudh · Bismillah', sub: 'Ask Allah to protect you', pose: 'qiyam', view: 'front', icon: 'stand',
        do: 'Keep standing with your hands folded. Ask Allah to protect you, then begin in the name of Allah.', recite: [{ id: 'taawwudh' }, { id: 'bismillah' }] });
      add({ group: g, title: 'Al-Fatihah', sub: 'The Opening', pose: 'qiyam', view: 'front', icon: 'book',
        do: 'Recite Surah Al-Fatihah, then say Amin.', recite: [{ id: 'fatihah' }] });
    } else {
      add({ group: g, title: 'Stand · Al-Fatihah', sub: `Start the ${ORD[r - 1]} rak‘ah`, pose: 'qiyam', view: 'front', icon: 'book', cue: 'takbir',
        do: `Say Allahu Akbar and stand up for the ${ORD[r - 1]} rak‘ah. Fold your hands, say Bismillah and recite Al-Fatihah, then say Amin.`, recite: [{ id: 'bismillah' }, { id: 'fatihah' }] });
    }
    if (surah) {
      add({ group: g, title: 'Al-Ikhlas', sub: 'A part of the Holy Quran', pose: 'qiyam', view: 'front', icon: 'book',
        do: 'Recite a part of the Holy Quran, like Surah Al-Ikhlas.', recite: [{ id: 'ikhlas' }] });
    }
    add({ group: g, title: 'Ruku‘', sub: 'Bow down', pose: 'ruku', view: 'side', icon: 'bow', cue: 'takbir',
      do: 'Say Allahu Akbar and bow. Hands on your knees, back flat from your waist to your head.', recite: [{ id: 'ruku', times: 3 }] });
    add({ group: g, title: 'Qaumah', sub: 'Stand up straight', pose: 'stand', view: 'front', icon: 'stand', cue: 'tasmi',
      do: 'Say Sami‘allahu liman hamidah as you stand up, arms by your sides. Then say Rabbana walakal-hamd.', recite: [{ id: 'tahmid' }] });
    for (const n of [1, 2]) {
      add({ group: g, title: n === 1 ? 'Sajdah' : '2nd Sajdah', sub: 'Prostrate to Allah', pose: 'sajdah', view: 'side', icon: 'sajdah', cue: 'takbir',
        do: n === 1
          ? 'Say Allahu Akbar and go down: knees first, then hands, nose and forehead. Elbows up and away from your sides. Toes bent towards the Qiblah.'
          : 'Say Allahu Akbar and go into Sajdah again.',
        recite: [{ id: 'sajdah', times: 3 }] });
      if (n === 1) {
        add({ group: g, title: 'Jilsah', sub: 'Sit between the two Sajdahs', pose: 'sit', view: 'front', icon: 'sit', cue: 'takbir',
          do: 'Say Allahu Akbar and sit up. Sit on your left foot, right foot upright with toes towards the Qiblah. Hands on your thighs near your knees.', recite: [{ id: 'jilsah' }] });
      }
    }
    const final = r === rakat;
    const qadah = r === 2 || final;
    if (qadah) {
      add({ group: g, title: final ? 'Qa‘dah · Tashahhud' : 'Qa‘dah · Tashahhud', sub: final ? 'The last sitting' : 'A short sitting', pose: 'tashahhud', view: 'hands', icon: 'finger', cue: 'takbir', point: true,
        do: 'Say Allahu Akbar and sit like in Jilsah. At “Ashhadu alla ilaha illallahu”, raise the first finger of your right hand, then put it down.',
        recite: [{ id: 'tashahhud' }] });
      if (final) {
        add({ group: g, title: 'Durud', sub: 'Blessings on the Holy Prophet (sa)', pose: 'sit', view: 'front', icon: 'heart',
          do: 'Keep sitting and recite the Durud.', recite: [{ id: 'durud' }] });
        add({ group: g, title: 'Prayers after Durud', sub: 'Short prayers from the Holy Quran', pose: 'sit', view: 'front', icon: 'heart',
          do: 'Keep sitting and say these short prayers from the Holy Quran.', recite: [{ id: 'rabbana' }, { id: 'rabbijalni' }] });
        add({ group: g, title: 'Salam', sub: 'Peace to the right, then the left', pose: 'salamR', then: 'salamL', view: 'face', icon: 'right',
          do: 'Turn your face to the right and say Assalamu ‘Alaikum wa Rahmatullah. Then turn your face to the left and say it again. Your Salat is complete!',
          recite: [{ id: 'salam', times: 2, poses: ['salamR', 'salamL'] }] });
      }
    }
  }
  return steps;
}

// Quiz: a posture, and the words said in it.
export const QUIZ = [
  { pose: 'takbir', view: 'face', answer: 'takbir', ask: 'Hands up to the ears. What do we say?' },
  { pose: 'qiyam', view: 'front', answer: 'fatihah', ask: 'Standing with hands folded. Which Surah do we recite in every rak‘ah?' },
  { pose: 'ruku', view: 'side', answer: 'ruku', ask: 'Bowing in Ruku‘. What do we say?' },
  { pose: 'stand', view: 'front', answer: 'tahmid', ask: 'Standing up after Ruku‘. What do we say?' },
  { pose: 'sajdah', view: 'side', answer: 'sajdah', ask: 'Forehead on the ground in Sajdah. What do we say?' },
  { pose: 'sit', view: 'front', answer: 'jilsah', ask: 'Sitting between the two Sajdahs. What do we say?' },
  { pose: 'tashahhud', view: 'hands', answer: 'tashahhud', ask: 'Sitting in Qa‘dah, raising one finger. What do we say?' },
  { pose: 'salamR', view: 'face', answer: 'salam', ask: 'Turning your face to the right. What do we say?' },
];
