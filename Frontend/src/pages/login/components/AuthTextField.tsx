import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

type AuthTextFieldProps = TextInputProps & {
  label: string;
  helperText?: string;
};

export function AuthTextField({
  label,
  helperText,
  style,
  ...props
}: AuthTextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      </View>
      <TextInput
        placeholderTextColor="#b8b8bf"
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#121212',
  },
  helperText: {
    fontSize: 12,
    color: '#94949c',
  },
  input: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#121212',
  },
});
