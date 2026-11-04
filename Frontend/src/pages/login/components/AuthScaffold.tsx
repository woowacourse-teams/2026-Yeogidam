import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {useScreenAnalytics} from '../../../analytics/uiEvents';

type AuthScaffoldProps = {
  children: React.ReactNode;
  /** 닫기·뒤로 버튼 이벤트에 붙는 화면 이름입니다. */
  screenName: string;
  onBack?: () => void;
  title?: string;
  description?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

export function AuthScaffold({
  children,
  screenName,
  onBack,
  title,
  description,
  contentStyle,
}: AuthScaffoldProps) {
  const {button} = useScreenAnalytics(screenName);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {onBack ? (
        <Pressable
          hitSlop={12}
          onPress={() => {
            button('close');
            onBack();
          }}
          style={styles.closeButton}>
          <MaterialIcons color="#121212" name="close" size={34} />
        </Pressable>
      ) : (
        <View style={styles.closeButtonSpacer} />
      )}

      <View style={styles.logoSection}>
        <Image
          source={require('../../../assets/illustrations/empty-illustration.png')}
          style={styles.logoImage}
        />
      </View>

      {title ? (
        <View style={styles.copySection}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      ) : null}

      <View style={contentStyle}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 32,
  },
  closeButton: {
    alignSelf: 'flex-start',
    marginLeft: -6,
  },
  closeButtonSpacer: {
    height: 34,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 84,
  },
  logoImage: {
    width: 156,
    height: 156,
    resizeMode: 'contain',
  },
  copySection: {
    marginTop: 28,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    color: '#121212',
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: '#7d7d84',
    textAlign: 'center',
  },
});
