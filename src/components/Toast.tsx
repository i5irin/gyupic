import styles from './Toast.module.css';

type Props = {
  message: string;
};

export default function Toast({ message }: Props) {
  return <div className={styles.toast}>{message}</div>;
}
